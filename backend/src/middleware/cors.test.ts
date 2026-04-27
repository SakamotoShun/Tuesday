import { describe, expect, it, mock } from 'bun:test';
import { Hono } from 'hono';

mock.module('../config', () => ({
  config: {
    corsOrigins: ['https://allowed.example'],
  },
}));

const { cors } = await import('./cors');

describe('cors middleware', () => {
  it('allows configured origins', async () => {
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => c.text('ok'));

    const response = await app.request('/', {
      headers: {
        Origin: 'https://allowed.example',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');
  });

  it('blocks disallowed non-preflight requests before handlers run', async () => {
    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.post('/', (c) => {
      handlerReached = true;
      return c.text('created');
    });

    const response = await app.request('/', {
      method: 'POST',
      headers: {
        Origin: 'https://denied.example',
      },
    });

    expect(response.status).toBe(403);
    expect(handlerReached).toBe(false);
  });
});
