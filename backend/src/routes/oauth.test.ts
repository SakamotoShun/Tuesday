import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Hono } from 'hono';

const logCalls: Array<{ level: string; event: string; context: Record<string, unknown> }> = [];

mock.module('../utils/logger', () => ({
  log: (level: string, event: string, context: Record<string, unknown>) => {
    logCalls.push({ level, event, context });
  },
}));

const { config } = await import('../config');
const { authService, oauthService } = await import('../services');
const { oauth } = await import('./oauth');

const originalRegisterClient = oauthService.registerClient;
const originalValidateSession = authService.validateSession;
const originalGetAuthorizeDetails = oauthService.getAuthorizeDetails;
const originalRateLimitEnabled = config.rateLimitEnabled;

function createApp() {
  const app = new Hono();
  app.route('/', oauth);
  return app;
}

describe('OAuth Routes', () => {
  beforeEach(() => {
    config.rateLimitEnabled = false;
    logCalls.length = 0;
  });

  afterEach(() => {
    oauthService.registerClient = originalRegisterClient;
    oauthService.getAuthorizeDetails = originalGetAuthorizeDetails;
    authService.validateSession = originalValidateSession;
    config.rateLimitEnabled = originalRateLimitEnabled;
  });

  it('handles token endpoint CORS preflight before static fallback can serve the SPA', async () => {
    const response = await createApp().request('/oauth/token', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://chatgpt.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, authorization',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://chatgpt.com');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(await response.text()).toBe('');
  });

  it('adds CORS headers to dynamic registration responses', async () => {
    oauthService.registerClient = async () => ({
      client_id: 'client-1',
      client_secret: undefined,
      client_name: 'Test Client',
      redirect_uris: ['https://client.example/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'projects:read',
      token_endpoint_auth_method: 'none',
    });

    const response = await createApp().request('/oauth/register', {
      method: 'POST',
      headers: {
        Origin: 'https://chatgpt.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ redirect_uris: ['https://client.example/callback'] }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://chatgpt.com');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('serves protected-resource metadata with a wildcard CORS origin', async () => {
    const response = await createApp().request('/.well-known/oauth-protected-resource/api/mcp', {
      headers: {
        Origin: 'https://claude.ai',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = (await response.json()) as { resource: string };
    expect(body.resource).toContain('/api/mcp');
  });

  it('serves canonical /mcp protected-resource metadata', async () => {
    const response = await createApp().request('/.well-known/oauth-protected-resource/mcp', {
      headers: { Origin: 'https://claude.ai' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = (await response.json()) as { resource: string };
    expect(body.resource).toBe('http://localhost/mcp');
  });

  it('answers discovery metadata preflight with MCP-Protocol-Version allowed', async () => {
    const response = await createApp().request('/.well-known/oauth-authorization-server', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://claude.ai',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'mcp-protocol-version',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('MCP-Protocol-Version');
  });

  it('logs safe registration context when client registration fails', async () => {
    oauthService.registerClient = async () => {
      throw new Error('Unsupported authentication method');
    };

    const response = await createApp().request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test Client',
        redirect_uris: ['https://client.example/callback'],
        grant_types: ['authorization_code'],
        scope: 'projects:read',
        token_endpoint_auth_method: 'client_secret_post',
        client_secret: 'must-not-be-logged',
      }),
    });

    expect(response.status).toBe(400);
    expect(logCalls).toEqual([{
      level: 'warn',
      event: 'oauth.register_failed',
      context: {
        error: 'Unsupported authentication method',
        clientName: 'Test Client',
        redirectUris: ['https://client.example/callback'],
        grantTypes: ['authorization_code'],
        scope: 'projects:read',
        authMethod: 'client_secret_post',
      },
    }]);
  });

  it('logs structured registration context for malformed JSON', async () => {
    const response = await createApp().request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"client_secret":"must-not-be-logged"',
    });

    expect(response.status).toBe(400);
    const call = logCalls.at(-1);
    expect(call?.event).toBe('oauth.register_failed');
    expect(call?.context).toMatchObject({
      clientName: null,
      redirectUris: [],
      grantTypes: [],
      scope: null,
      authMethod: null,
    });
    expect(JSON.stringify(call)).not.toContain('must-not-be-logged');
  });

  it('logs safe authorization context when authorization fails', async () => {
    authService.validateSession = async () => ({ id: 'user-1' } as any);
    oauthService.getAuthorizeDetails = async () => {
      throw new Error('Redirect URI mismatch');
    };

    const response = await createApp().request(
      '/oauth/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=projects%3Aread&state=private-state&code_challenge=private-challenge&code_challenge_method=S256&resource=https%3A%2F%2Fapi.example',
      { headers: { Cookie: 'session_id=session-1' } },
    );

    expect(response.status).toBe(400);
    expect(logCalls.at(-1)).toEqual({
      level: 'warn',
      event: 'oauth.authorize_failed',
      context: {
        error: 'Redirect URI mismatch',
        clientId: 'client-1',
        redirectUri: 'https://client.example/callback',
        scope: 'projects:read',
        responseType: 'code',
        codeChallengeMethod: 'S256',
        hasState: true,
        hasResource: true,
      },
    });
    expect(JSON.stringify(logCalls.at(-1))).not.toContain('private-state');
    expect(JSON.stringify(logCalls.at(-1))).not.toContain('private-challenge');
  });

  for (const action of ['approve', 'deny'] as const) {
    it(`logs ${action} failures without exposing the invalid nonce`, async () => {
      authService.validateSession = async () => ({ id: 'user-1' } as any);

      const response = await createApp().request(
        `/oauth/authorize/${action}?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=projects%3Aread&state=private-state&code_challenge=private-challenge&code_challenge_method=S256&resource=https%3A%2F%2Fapi.example`,
        {
          method: 'POST',
          headers: {
            Cookie: 'session_id=session-1',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'approval_nonce=private-nonce',
        },
      );

      expect(response.status).toBe(400);
      expect(logCalls.at(-1)).toEqual({
        level: 'warn',
        event: `oauth.${action}_failed`,
        context: {
          error: 'Invalid approval nonce',
          clientId: 'client-1',
          redirectUri: 'https://client.example/callback',
          scope: 'projects:read',
          responseType: 'code',
          codeChallengeMethod: 'S256',
          hasState: true,
          hasResource: true,
          userId: 'user-1',
        },
      });
      expect(JSON.stringify(logCalls.at(-1))).not.toContain('private-nonce');
      expect(JSON.stringify(logCalls.at(-1))).not.toContain('private-state');
      expect(JSON.stringify(logCalls.at(-1))).not.toContain('private-challenge');
    });
  }
});
