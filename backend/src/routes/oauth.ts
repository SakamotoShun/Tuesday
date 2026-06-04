import { Hono } from 'hono';
import { config } from '../config';
import { rateLimit } from '../middleware';
import { authService, oauthService } from '../services';
import type { User } from '../types';

const oauth = new Hono();
const oauthRegistrationRateLimit = rateLimit({
  name: 'oauth-registration',
  windowMs: 60 * 1000,
  maxRequests: 10,
  requireIp: true,
  missingIpMessage: 'Unable to determine client IP for OAuth registration request',
});

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

function oauthError(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status });
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
}: {
  user: User;
  clientName: string;
  scopes: string[];
  query: string;
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
        <div class="actions">
          <button type="submit">Allow access</button>
          <a href="/">Cancel</a>
        </div>
      </form>
    </main>
  </body>
</html>`;
}

oauth.get('/.well-known/oauth-authorization-server', (c) => {
  return c.json(oauthService.getAuthorizationServerMetadata(publicBaseUrl(c.req.url)));
});

oauth.get('/.well-known/oauth-protected-resource', (c) => {
  return c.json(oauthService.getProtectedResourceMetadata(publicBaseUrl(c.req.url)));
});

oauth.get('/.well-known/oauth-protected-resource/api/mcp', (c) => {
  return c.json(oauthService.getProtectedResourceMetadata(publicBaseUrl(c.req.url)));
});

oauth.post('/oauth/register', oauthRegistrationRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const result = await oauthService.registerClient(body);
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid client metadata';
    return oauthError('invalid_client_metadata', message);
  }
});

oauth.get('/oauth/authorize', async (c) => {
  const input = parseAuthorize(c);
  const query = new URL(c.req.url).searchParams.toString();
  const user = await getUserFromCookie(c.req.header('Cookie'));
  if (!user) {
    return c.redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  try {
    const details = await oauthService.getAuthorizeDetails(input);
    return c.html(renderConsentPage({
      user,
      clientName: details.client.clientName,
      scopes: details.scopes,
      query,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid authorization request';
    return oauthError('invalid_request', message);
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
    const redirectUrl = await oauthService.approveAuthorization(input, user.id);
    return c.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid authorization request';
    return oauthError('invalid_request', message);
  }
});

oauth.post('/oauth/token', async (c) => {
  try {
    const basic = parseBasicAuth(c.req.header('Authorization'));
    const body = await parseTokenBody(c);
    const clientId = basic?.clientId ?? String(body.client_id ?? '');
    const clientSecret = basic?.clientSecret ?? (body.client_secret ? String(body.client_secret) : null);
    const grantType = String(body.grant_type ?? '');
    const input = {
      grantType,
      code: String(body.code ?? ''),
      redirectUri: String(body.redirect_uri ?? ''),
      clientId,
      clientSecret,
      codeVerifier: String(body.code_verifier ?? ''),
      refreshToken: String(body.refresh_token ?? ''),
    };
    const result = grantType === 'refresh_token' ? await oauthService.refreshAccessToken(input) : await oauthService.exchangeAuthorizationCode({
      grantType: String(body.grant_type ?? ''),
      code: String(body.code ?? ''),
      redirectUri: String(body.redirect_uri ?? ''),
      clientId,
      clientSecret,
      codeVerifier: String(body.code_verifier ?? ''),
    });
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid token request';
    return oauthError('invalid_grant', message);
  }
});

oauth.post('/oauth/revoke', async (c) => {
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
    return c.body(null, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid revocation request';
    return oauthError(message === 'Invalid client' ? 'invalid_client' : 'invalid_request', message);
  }
});

export { oauth };
