import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Hono } from 'hono';

mock.module('../middleware', () => ({
  auth: async (c: any, next: () => Promise<void>) => {
    c.set('user', { id: 'admin-1', role: 'admin' });
    await next();
  },
  requireAdmin: async (_c: any, next: () => Promise<void>) => next(),
}));

const { DocBlockCanonicalizationError } = await import('../collab/docContent');
const { hiringService } = await import('../services');
const { hiring } = await import('./hiring');

function createApp() {
  const app = new Hono();
  app.onError((error, c) => c.json({ error: error.message }, 500));
  app.route('/hiring', hiring);
  return app;
}

describe('Hiring note error handling', () => {
  afterEach(() => {
    mock.restore();
  });

  it('maps malformed canonical content to bad request', async () => {
    spyOn(hiringService, 'createNote').mockRejectedValue(
      new DocBlockCanonicalizationError(new TypeError('invalid inline content'))
    );

    const response = await createApp().request('/hiring/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Note', content: [] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Blocks contain invalid BlockNote content',
      },
    });
  });

  it('leaves infrastructure failures for the server error handler', async () => {
    spyOn(hiringService, 'createNote').mockRejectedValue(new Error('database unavailable'));

    const response = await createApp().request('/hiring/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Note', content: [] }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'database unavailable' });
  });
});
