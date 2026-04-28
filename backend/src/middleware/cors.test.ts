import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config';

const { cors } = await import('./cors');

const originalCorsOrigins = [...config.corsOrigins];
const originalNodeEnv = config.nodeEnv;
const originalPublicBaseUrl = config.publicBaseUrl;
const originalTrustProxy = config.trustProxy;

describe('cors middleware', () => {
  beforeEach(() => {
    config.corsOrigins = ['https://allowed.example'];
    config.nodeEnv = 'production';
    config.publicBaseUrl = undefined;
    config.trustProxy = false;
  });

  afterEach(() => {
    config.corsOrigins = [...originalCorsOrigins];
    config.nodeEnv = originalNodeEnv;
    config.publicBaseUrl = originalPublicBaseUrl;
    config.trustProxy = originalTrustProxy;
  });

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

  it('allows same-origin POST requests without echoing CORS headers', async () => {
    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.post('/', (c) => {
      handlerReached = true;
      return c.text('created');
    });

    const response = await app.request('https://app.example/', {
      method: 'POST',
      headers: {
        Origin: 'https://app.example',
      },
    });

    expect(response.status).toBe(200);
    expect(handlerReached).toBe(true);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allows localhost origins on any port during development', async () => {
    config.nodeEnv = 'development';

    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => {
      handlerReached = true;
      return c.text('ok');
    });

    const response = await app.request('http://localhost:8080/', {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });

    expect(response.status).toBe(200);
    expect(handlerReached).toBe(true);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
  });

  it('allows 127.0.0.1 origins during development', async () => {
    config.nodeEnv = 'development';

    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => {
      handlerReached = true;
      return c.text('ok');
    });

    const response = await app.request('http://localhost:8080/', {
      headers: {
        Origin: 'http://127.0.0.1:3000',
      },
    });

    expect(response.status).toBe(200);
    expect(handlerReached).toBe(true);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:3000');
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

  it('allows trusted forwarded same-origin requests when TRUST_PROXY is enabled', async () => {
    config.trustProxy = true;

    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.post('/', (c) => {
      handlerReached = true;
      return c.text('created');
    });

    const response = await app.request('http://internal.service/', {
      method: 'POST',
      headers: {
        Origin: 'https://workhub.example.com',
        Host: 'internal.service',
        'X-Forwarded-Host': 'workhub.example.com',
        'X-Forwarded-Proto': 'https',
      },
    });

    expect(response.status).toBe(200);
    expect(handlerReached).toBe(true);
  });

  it('allows same-origin requests via configured public base URL without trusting proxy headers', async () => {
    config.publicBaseUrl = 'https://workhub.example.com';

    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => {
      handlerReached = true;
      return c.text('ok');
    });

    const response = await app.request('http://internal.service/', {
      headers: {
        Origin: 'https://workhub.example.com',
        Host: 'internal.service',
        'X-Forwarded-Host': 'workhub.example.com',
        'X-Forwarded-Proto': 'https',
      },
    });

    expect(response.status).toBe(200);
    expect(handlerReached).toBe(true);
  });

  it('ignores forwarded headers when TRUST_PROXY is disabled', async () => {
    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.post('/', (c) => {
      handlerReached = true;
      return c.text('created');
    });

    const response = await app.request('http://internal.service/', {
      method: 'POST',
      headers: {
        Origin: 'https://workhub.example.com',
        Host: 'internal.service',
        'X-Forwarded-Host': 'workhub.example.com',
        'X-Forwarded-Proto': 'https',
      },
    });

    expect(response.status).toBe(403);
    expect(handlerReached).toBe(false);
  });

  it('does not auto-allow localhost origins outside development', async () => {
    let handlerReached = false;
    const app = new Hono();
    app.use('*', cors);
    app.post('/', (c) => {
      handlerReached = true;
      return c.text('created');
    });

    const response = await app.request('http://localhost:8080/', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
      },
    });

    expect(response.status).toBe(403);
    expect(handlerReached).toBe(false);
  });

  it('can be scoped to API routes without blocking page navigations', async () => {
    let pageHandlerReached = false;
    let apiHandlerReached = false;
    const app = new Hono();
    app.use('/api/*', cors);
    app.get('/', (c) => {
      pageHandlerReached = true;
      return c.text('ok');
    });
    app.get('/api/v1/projects', (c) => {
      apiHandlerReached = true;
      return c.json({ ok: true });
    });

    const pageResponse = await app.request('https://app.example/', {
      headers: {
        Origin: 'https://denied.example',
      },
    });

    const apiResponse = await app.request('https://app.example/api/v1/projects', {
      headers: {
        Origin: 'https://denied.example',
      },
    });

    expect(pageResponse.status).toBe(200);
    expect(pageHandlerReached).toBe(true);
    expect(apiResponse.status).toBe(403);
    expect(apiHandlerReached).toBe(false);
  });

  it('can be scoped to API routes without blocking static assets', async () => {
    let assetHandlerReached = false;
    const app = new Hono();
    app.use('/api/*', cors);
    app.get('/assets/app.css', (c) => {
      assetHandlerReached = true;
      return c.text('body {}', 200, {
        'Content-Type': 'text/css; charset=utf-8',
      });
    });

    const response = await app.request('https://app.example/assets/app.css', {
      headers: {
        Origin: 'https://denied.example',
      },
    });

    expect(response.status).toBe(200);
    expect(assetHandlerReached).toBe(true);
  });
});
