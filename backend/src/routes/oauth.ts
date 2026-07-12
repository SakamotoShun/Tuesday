import { Hono } from 'hono';
import type { Context } from 'hono';
import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { rateLimit } from '../middleware';
import { publicEndpointCors, wellKnownCors, OAUTH_CORS_OPTIONS } from '../middleware/public-cors';
import { authService, oauthService } from '../services';
import type { User } from '../types';
import { log } from '../utils/logger';

const oauth = new Hono();
const oauthRegistrationRateLimit = rateLimit({
  name: 'oauth-registration',
  windowMs: 60 * 1000,
  maxRequests: 10,
  requireIp: true,
  missingIpMessage: 'Unable to determine client IP for OAuth registration request',
});
const APPROVAL_NONCE_TTL_MS = 5 * 60 * 1000;
const approvalNonces = new Map<string, { userId: string; clientId: string; expiresAt: number }>();

function publicBaseUrl(requestUrl: string): string {
  return config.publicBaseUrl ?? new URL(requestUrl).origin;
}

function getSessionId(cookie: string | undefined): string | null {
  return cookie?.match(/session_id=([^;]+)/)?.[1] ?? null;
}

async function getUserFromCookie(cookie: string | undefined): Promise<User | null> {
  const sessionId = getSessionId(cookie);
  if (!sessionId) return null;
  return authService.validateSession(sessionId);
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function oauthCors(c: Context) {
  return publicEndpointCors(c, OAUTH_CORS_OPTIONS);
}

function oauthError(c: any, error: string, description: string, status = 400) {
  return c.json({ error, error_description: description }, status);
}

function createApprovalNonce(userId: string, clientId: string): string {
  const now = Date.now();
  for (const [otherNonce, record] of approvalNonces) {
    if (record.expiresAt <= now) approvalNonces.delete(otherNonce);
  }
  const nonce = randomBytes(32).toString('base64url');
  approvalNonces.set(nonce, { userId, clientId, expiresAt: now + APPROVAL_NONCE_TTL_MS });
  return nonce;
}

function consumeApprovalNonce(nonce: string, userId: string, clientId: string): boolean {
  const record = approvalNonces.get(nonce);
  approvalNonces.delete(nonce);
  return !!record && record.userId === userId && record.clientId === clientId && record.expiresAt > Date.now();
}

function parseAuthorize(c: any) {
  return {
    responseType: c.req.query('response_type') ?? '',
    clientId: c.req.query('client_id') ?? '',
    redirectUri: c.req.query('redirect_uri') ?? '',
    scope: c.req.query('scope') ?? undefined,
    state: c.req.query('state') ?? undefined,
    codeChallenge: c.req.query('code_challenge') ?? '',
    codeChallengeMethod: c.req.query('code_challenge_method') ?? '',
    resource: c.req.query('resource') ?? undefined,
  };
}

function registrationLogContext(body?: Record<string, unknown>) {
  return {
    clientName: body?.client_name ? String(body.client_name) : null,
    redirectUris: Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [],
    grantTypes: Array.isArray(body?.grant_types) ? body.grant_types.map(String) : [],
    scope: body?.scope ? String(body.scope) : null,
    authMethod: body?.token_endpoint_auth_method ? String(body.token_endpoint_auth_method) : null,
  };
}

function authorizationLogContext(input: ReturnType<typeof parseAuthorize>) {
  return {
    clientId: input.clientId || null,
    redirectUri: input.redirectUri || null,
    scope: input.scope ?? null,
    responseType: input.responseType || null,
    codeChallengeMethod: input.codeChallengeMethod || null,
    hasState: !!input.state,
    hasResource: !!input.resource,
  };
}

async function parseTokenBody(c: any) {
  const contentType = c.req.header('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    return c.req.json();
  }

  const form = await c.req.formData();
  return Object.fromEntries(form.entries());
}

function parseBasicAuth(header: string | undefined): { clientId: string; clientSecret: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

function renderConsentPage({
  user,
  clientName,
  scopes,
  query,
  approvalNonce,
}: {
  user: User;
  clientName: string;
  scopes: string[];
  query: string;
  approvalNonce: string;
}) {
  const scopeItems = scopes.map((scope) => `<li>${htmlEscape(scope)}</li>`).join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${htmlEscape(clientName)} - Tuesday</title>
    <style>
      body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, sans-serif; background: #f4ead7; color: #1f130b; display: grid; place-items: center; }
      main { width: min(92vw, 560px); border: 1px solid rgba(63,45,31,.22); border-radius: 28px; padding: 32px; background: rgba(255,250,242,.96); box-shadow: 0 30px 80px rgba(42,28,18,.2); }
      h1 { margin: 0; font-size: 30px; line-height: 1.1; }
      p { color: #49372a; line-height: 1.55; }
      ul { margin: 18px 0; padding: 16px 20px; border-radius: 18px; background: #fff6ea; }
      li { margin: 8px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
      .actions { display: flex; gap: 12px; margin-top: 24px; }
      button, a { border-radius: 14px; padding: 12px 18px; font-weight: 700; border: 0; cursor: pointer; text-decoration: none; }
      button { background: #1d6a66; color: #f6f0e6; }
      a { background: #eee2d2; color: #2c2118; }
      .user { font-size: 13px; color: #6a5442; }
    </style>
  </head>
  <body>
    <main>
      <p class="user">Signed in as ${htmlEscape(user.email)}</p>
      <h1>Allow ${htmlEscape(clientName)} to access Tuesday?</h1>
      <p>This MCP client is requesting access to your Tuesday workspace with these scopes:</p>
      <ul>${scopeItems}</ul>
      <form method="post" action="/oauth/authorize/approve?${htmlEscape(query)}">
        <input type="hidden" name="approval_nonce" value="${htmlEscape(approvalNonce)}" />
        <div class="actions">
          <button type="submit">Allow access</button>
        </div>
      </form>
      <form method="post" action="/oauth/authorize/deny?${htmlEscape(query)}">
        <input type="hidden" name="approval_nonce" value="${htmlEscape(approvalNonce)}" />
        <div class="actions">
          <button type="submit">Deny access</button>
        </div>
      </form>
    </main>
  </body>
</html>`;
}

oauth.on(['GET', 'OPTIONS'], '/.well-known/oauth-authorization-server', (c) => {
  const preflight = wellKnownCors(c);
  if (preflight) return preflight;
  return c.json(oauthService.getAuthorizationServerMetadata(publicBaseUrl(c.req.url)));
});

oauth.on(['GET', 'OPTIONS'], '/.well-known/oauth-protected-resource', (c) => {
  const preflight = wellKnownCors(c);
  if (preflight) return preflight;
  return c.json(oauthService.getProtectedResourceMetadata(publicBaseUrl(c.req.url)));
});

oauth.on(['GET', 'OPTIONS'], '/.well-known/oauth-protected-resource/api/mcp', (c) => {
  const preflight = wellKnownCors(c);
  if (preflight) return preflight;
  return c.json(oauthService.getProtectedResourceMetadata(publicBaseUrl(c.req.url), '/api/mcp'));
});

oauth.on(['GET', 'OPTIONS'], '/.well-known/oauth-protected-resource/mcp', (c) => {
  const preflight = wellKnownCors(c);
  if (preflight) return preflight;
  return c.json(oauthService.getProtectedResourceMetadata(publicBaseUrl(c.req.url), '/mcp'));
});

oauth.post('/oauth/register', oauthRegistrationRateLimit, async (c) => {
  const corsResponse = oauthCors(c);
  if (corsResponse) return corsResponse;

  let registerContext = registrationLogContext();
  try {
    const body = await c.req.json() as Record<string, unknown>;
    registerContext = registrationLogContext(body);
    const result = await oauthService.registerClient(body);
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid client metadata';
    log('warn', 'oauth.register_failed', {
      error: message,
      ...registerContext,
    });
    return oauthError(c, 'invalid_client_metadata', message);
  }
});

oauth.options('/oauth/register', (c) => oauthCors(c) ?? c.body(null, 204));

oauth.get('/oauth/authorize', async (c) => {
  const input = parseAuthorize(c);
  const query = new URL(c.req.url).searchParams.toString();
  const user = await getUserFromCookie(c.req.header('Cookie'));
  if (!user) {
    return c.redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  try {
    const details = await oauthService.getAuthorizeDetails(input);
    const approvalNonce = createApprovalNonce(user.id, input.clientId);
    return c.html(renderConsentPage({
      user,
      clientName: details.client.clientName,
      scopes: details.scopes,
      query,
      approvalNonce,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid authorization request';
    log('warn', 'oauth.authorize_failed', {
      error: message,
      ...authorizationLogContext(input),
    });
    return oauthError(c, 'invalid_request', message);
  }
});

oauth.post('/oauth/authorize/approve', async (c) => {
  const input = parseAuthorize(c);
  const user = await getUserFromCookie(c.req.header('Cookie'));
  if (!user) {
    const query = new URL(c.req.url).searchParams.toString();
    return c.redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  try {
    const form = await c.req.formData();
    const approvalNonce = String(form.get('approval_nonce') ?? '');
    if (!consumeApprovalNonce(approvalNonce, user.id, input.clientId)) {
      log('warn', 'oauth.approve_failed', {
        error: 'Invalid approval nonce',
        ...authorizationLogContext(input),
        userId: user.id,
      });
      return oauthError(c, 'invalid_request', 'Invalid approval nonce');
    }
    const redirectUrl = await oauthService.approveAuthorization(input, user.id);
    return c.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid authorization request';
    log('warn', 'oauth.approve_failed', {
      error: message,
      ...authorizationLogContext(input),
      userId: user.id,
    });
    return oauthError(c, 'invalid_request', message);
  }
});

oauth.post('/oauth/authorize/deny', async (c) => {
  const input = parseAuthorize(c);
  const user = await getUserFromCookie(c.req.header('Cookie'));
  if (!user) {
    const query = new URL(c.req.url).searchParams.toString();
    return c.redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  try {
    const form = await c.req.formData();
    const approvalNonce = String(form.get('approval_nonce') ?? '');
    if (!consumeApprovalNonce(approvalNonce, user.id, input.clientId)) {
      log('warn', 'oauth.deny_failed', {
        error: 'Invalid approval nonce',
        ...authorizationLogContext(input),
        userId: user.id,
      });
      return oauthError(c, 'invalid_request', 'Invalid approval nonce');
    }
    const redirectUrl = await oauthService.denyAuthorization(input);
    return c.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid authorization request';
    log('warn', 'oauth.deny_failed', {
      error: message,
      ...authorizationLogContext(input),
      userId: user.id,
    });
    return oauthError(c, 'invalid_request', message);
  }
});

oauth.post('/oauth/token', async (c) => {
  const corsResponse = oauthCors(c);
  if (corsResponse) return corsResponse;

  let tokenLogContext: Record<string, unknown> = { grantType: 'unavailable' };
  try {
    const basic = parseBasicAuth(c.req.header('Authorization'));
    const body = await parseTokenBody(c);
    const clientId = basic?.clientId ?? String(body.client_id ?? '');
    const clientSecret = basic?.clientSecret ?? (body.client_secret ? String(body.client_secret) : null);
    const grantType = String(body.grant_type ?? '');
    tokenLogContext = {
      grantType,
      clientId: clientId || null,
      hasCode: !!body.code,
      hasCodeVerifier: !!body.code_verifier,
      hasRedirectUri: !!body.redirect_uri,
      hasResource: !!body.resource,
      hasRefreshToken: !!body.refresh_token,
      authMethod: basic ? 'client_secret_basic' : (body.client_secret ? 'client_secret_post' : 'none'),
    };
    const input = {
      grantType,
      code: String(body.code ?? ''),
      redirectUri: String(body.redirect_uri ?? ''),
      clientId,
      clientSecret,
      codeVerifier: String(body.code_verifier ?? ''),
      refreshToken: String(body.refresh_token ?? ''),
      resource: body.resource ? String(body.resource) : undefined,
    };
    const result = grantType === 'refresh_token' ? await oauthService.refreshAccessToken(input) : await oauthService.exchangeAuthorizationCode({
      grantType: String(body.grant_type ?? ''),
      code: String(body.code ?? ''),
      redirectUri: String(body.redirect_uri ?? ''),
      clientId,
      clientSecret,
      codeVerifier: String(body.code_verifier ?? ''),
      resource: body.resource ? String(body.resource) : undefined,
    });
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid token request';
    log('warn', 'oauth.token_failed', {
      error: message,
      ...tokenLogContext,
    });
    return oauthError(c, 'invalid_grant', message);
  }
});

oauth.options('/oauth/token', (c) => oauthCors(c) ?? c.body(null, 204));

oauth.post('/oauth/revoke', async (c) => {
  const corsResponse = oauthCors(c);
  if (corsResponse) return corsResponse;

  try {
    const basic = parseBasicAuth(c.req.header('Authorization'));
    const body = await parseTokenBody(c);
    const clientId = basic?.clientId ?? String(body.client_id ?? '');
    const clientSecret = basic?.clientSecret ?? (body.client_secret ? String(body.client_secret) : null);

    await oauthService.revokeToken({
      token: String(body.token ?? ''),
      tokenTypeHint: body.token_type_hint ? String(body.token_type_hint) : undefined,
      clientId,
      clientSecret,
    });
    return c.json({ revoked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid revocation request';
    return oauthError(c, message === 'Invalid client' ? 'invalid_client' : 'invalid_request', message, message === 'Invalid client' ? 401 : 400);
  }
});

oauth.options('/oauth/revoke', (c) => oauthCors(c) ?? c.body(null, 204));

export { oauth };
