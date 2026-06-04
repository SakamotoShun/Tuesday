import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { mcp } from './mcp';

function createApp() {
  const app = new Hono();
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
});
