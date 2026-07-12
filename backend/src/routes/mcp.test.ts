import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config';
import { apiCors } from '../middleware/cors';
import { mcpCors } from '../middleware/public-cors';
import { mcp } from './mcp';

const originalCorsOrigins = [...config.corsOrigins];
const originalNodeEnv = config.nodeEnv;
const originalPublicBaseUrl = config.publicBaseUrl;

function createApp() {
  const app = new Hono();
  app.route('/mcp', mcp);
  app.route('/api/mcp', mcp);
  return app;
}

// Mirrors production mounting (backend/src/index.ts), including the dedicated
// browser-connector policy for the canonical non-API endpoint.
function createProductionShapedApp() {
  const app = new Hono();
  app.use('/api/*', apiCors);
  app.use('/mcp', mcpCors);
  app.use('/mcp/', mcpCors);
  app.route('/mcp', mcp);
  app.route('/api/mcp', mcp);
  return app;
}

describe('MCP Routes', () => {
  it('returns method not allowed for unsupported streamable HTTP GET', async () => {
    const response = await createApp().request('/api/mcp', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('accepts initialized notifications with HTTP 202', async () => {
    const response = await createApp().request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });

  for (const protocolVersion of ['2025-03-26', '2025-06-18']) {
    it(`echoes supported initialize protocol version ${protocolVersion}`, async () => {
      const response = await createApp().request('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion } }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { result: { protocolVersion: string } };
      expect(body.result.protocolVersion).toBe(protocolVersion);
    });
  }

  for (const [description, params] of [
    ['unknown', { protocolVersion: '2099-01-01' }],
    ['missing', {}],
    ['non-string', { protocolVersion: 123 }],
  ] as const) {
    it(`uses the latest protocol version for ${description} initialize versions`, async () => {
      const response = await createApp().request('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { result: { protocolVersion: string } };
      expect(body.result.protocolVersion).toBe('2025-06-18');
    });
  }

  it('rejects unsupported protocol versions on non-initialize requests', async () => {
    const response = await createApp().request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2099-01-01' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain('Unsupported MCP protocol version');
  });

  it('accepts supported protocol versions before applying existing authentication', async () => {
    const response = await createApp().request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });

    expect(response.status).toBe(401);
  });
});

describe('MCP Routes with browser-connector CORS', () => {
  beforeEach(() => {
    config.corsOrigins = ['https://allowed.example'];
    config.nodeEnv = 'production';
    config.publicBaseUrl = 'https://workhub.example.com';
  });

  afterEach(() => {
    config.corsOrigins = [...originalCorsOrigins];
    config.nodeEnv = originalNodeEnv;
    config.publicBaseUrl = originalPublicBaseUrl;
  });

  it('serves the canonical /mcp endpoint to browser connectors', async () => {
    const response = await createProductionShapedApp().request('/mcp', {
      method: 'POST',
      headers: {
        Origin: 'https://claude.ai',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
  });

  it('points /mcp authentication challenges to its path-specific metadata', async () => {
    const response = await createProductionShapedApp().request('/mcp', {
      method: 'POST',
      headers: {
        Origin: 'https://claude.ai',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
  });

  it('serves initialize to browser MCP clients from unlisted HTTPS origins', async () => {
    const response = await createProductionShapedApp().request('/api/mcp', {
      method: 'POST',
      headers: {
        Origin: 'https://claude.ai',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
    const body = (await response.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('Tuesday');
  });

  it('exposes the WWW-Authenticate challenge to cross-origin browser clients', async () => {
    const response = await createProductionShapedApp().request('/api/mcp', {
      method: 'POST',
      headers: {
        Origin: 'https://claude.ai',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('oauth-protected-resource');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('WWW-Authenticate');
  });

  it('carries CORS headers on method-not-allowed responses', async () => {
    const response = await createProductionShapedApp().request('/api/mcp', {
      method: 'GET',
      headers: {
        Origin: 'https://claude.ai',
        Accept: 'text/event-stream',
      },
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
  });

  it('carries CORS headers on unsupported protocol version errors', async () => {
    const response = await createProductionShapedApp().request('/api/mcp', {
      method: 'POST',
      headers: {
        Origin: 'https://claude.ai',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2099-01-01',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
  });
});
