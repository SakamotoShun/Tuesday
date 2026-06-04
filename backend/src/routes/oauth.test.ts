import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config';
import { oauthService } from '../services';
import { oauth } from './oauth';

const originalRegisterClient = oauthService.registerClient;
const originalRateLimitEnabled = config.rateLimitEnabled;

function createApp() {
  const app = new Hono();
  app.route('/', oauth);
  return app;
}

describe('OAuth Routes', () => {
  beforeEach(() => {
    config.rateLimitEnabled = false;
  });

  afterEach(() => {
    oauthService.registerClient = originalRegisterClient;
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
});
