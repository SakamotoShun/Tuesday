import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let createSessionCookie: typeof import('../test/integration').createSessionCookie;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedSession: typeof import('../test/integration').seedSession;
let seedUser: typeof import('../test/integration').seedUser;
let pkceS256Challenge: typeof import('../utils/oauth').pkceS256Challenge;
let oauth: typeof import('./oauth').oauth;
let mcp: typeof import('./mcp').mcp;

if (runIntegration) {
  ({ createSessionCookie, ensureIntegrationDb, seedSession, seedUser } = await import('../test/integration'));
  ({ pkceS256Challenge } = await import('../utils/oauth'));
  ({ oauth } = await import('./oauth'));
  ({ mcp } = await import('./mcp'));
}

const allScopes = [
  'projects:read',
  'tasks:read',
  'tasks:write',
  'docs:read',
  'docs:write',
  'meetings:read',
  'meetings:write',
  'time:read',
  'time:write',
  'search:read',
];

describeIntegration('OAuth to MCP flow', () => {
  const originalPublicBaseUrl = config.publicBaseUrl;
  const originalRateLimitEnabled = config.rateLimitEnabled;
  const publicBaseUrl = 'https://tuesday.integration.test';

  beforeAll(async () => {
    config.publicBaseUrl = publicBaseUrl;
    config.rateLimitEnabled = false;
    await ensureIntegrationDb();
  });

  afterAll(() => {
    config.publicBaseUrl = originalPublicBaseUrl;
    config.rateLimitEnabled = originalRateLimitEnabled;
  });

  it('grants full scopes for Claude registration metadata and exposes write tools', async () => {
    const user = await seedUser();
    const session = await seedSession(user.id);
    const sessionCookie = createSessionCookie(session.id);
    const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
    const resource = `${publicBaseUrl}/mcp`;
    const verifier = 'claude-ai-pkce-verifier-that-is-long-enough-for-s256-testing';
    const challenge = pkceS256Challenge(verifier);
    const app = new Hono();
    app.route('/', oauth);
    app.route('/mcp', mcp);
    app.route('/api/mcp', mcp);

    const registerResponse = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Claude.ai',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'claudeai',
        token_endpoint_auth_method: 'none',
      }),
    });

    expect(registerResponse.status).toBe(201);
    const registration = await registerResponse.json() as { client_id: string; scope: string };
    expect(registration.scope.split(' ')).toEqual(allScopes);

    const authorizeQuery = new URLSearchParams({
      response_type: 'code',
      client_id: registration.client_id,
      redirect_uri: redirectUri,
      scope: 'claudeai',
      state: 'integration-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource,
    });
    const authorizePath = `/oauth/authorize?${authorizeQuery}`;
    const authorizeResponse = await app.request(authorizePath, {
      headers: { Cookie: sessionCookie },
    });

    expect(authorizeResponse.status).toBe(200);
    const consentHtml = await authorizeResponse.text();
    for (const scope of allScopes) {
      expect(consentHtml).toContain(`<li>${scope}</li>`);
    }
    const approvalNonce = consentHtml.match(/name="approval_nonce" value="([^"]+)"/)?.[1];
    expect(approvalNonce).toBeTruthy();

    const approveResponse = await app.request(`/oauth/authorize/approve?${authorizeQuery}`, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ approval_nonce: approvalNonce! }).toString(),
    });

    expect(approveResponse.status).toBe(302);
    const callback = new URL(approveResponse.headers.get('Location')!);
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get('state')).toBe('integration-state');
    const code = callback.searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenResponse = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: redirectUri,
        client_id: registration.client_id,
        code_verifier: verifier,
        resource,
      }).toString(),
    });

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.headers.get('Cache-Control')).toBe('no-store');
    const token = await tokenResponse.json() as {
      access_token: string;
      token_type: string;
      refresh_token: string;
      scope: string;
    };
    expect(token.token_type).toBe('Bearer');
    expect(token.access_token).toBeTruthy();
    expect(token.refresh_token).toBeTruthy();
    expect(token.scope.split(' ')).toEqual(allScopes);

    const toolsResponse = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    expect(toolsResponse.status).toBe(200);
    const toolsPayload = await toolsResponse.json() as {
      result: { tools: Array<{ name: string }> };
    };
    const toolNames = toolsPayload.result.tools.map((tool) => tool.name);
    expect(toolNames).toContain('create_doc');
    expect(toolNames).toContain('create_task');
    expect(toolNames).toContain('create_time_entry');
  });
});
