import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Hono } from 'hono';

const config = {
  rateLimitEnabled: true,
  rateLimitBackend: 'memory' as 'memory' | 'postgres',
  trustProxy: false,
};

type PostgresRateLimitState = {
  count: number;
  expiresAt: number;
};

const postgresState = new Map<string, PostgresRateLimitState>();

const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const statement = strings.join(' ');

  if (statement.includes('DELETE FROM rate_limit_entries')) {
    const now = Date.now();
    for (const [key, entry] of postgresState) {
      if (entry.expiresAt <= now) {
        postgresState.delete(key);
      }
    }
    return [];
  }

  if (statement.includes('INSERT INTO rate_limit_entries')) {
    expect(statement).toContain('first_request_at');
    expect(statement).toContain('ON CONFLICT (scope, client_key)');

    const scope = values[0] as string;
    const key = values[1] as string;
    const currentTime = values[2] as Date;
    const nextResetTime = values[3] as Date;
    const stateKey = `${scope}:${key}`;
    const existing = postgresState.get(stateKey);

    if (!existing || existing.expiresAt <= currentTime.getTime()) {
      const nextState = {
        count: 1,
        expiresAt: nextResetTime.getTime(),
      };
      postgresState.set(stateKey, nextState);
      return [{ count: nextState.count, reset_time: nextState.expiresAt }];
    }

    existing.count += 1;
    return [{ count: existing.count, reset_time: existing.expiresAt }];
  }

  throw new Error(`Unexpected query: ${statement}`);
};

mock.module('../config', () => ({ config }));
mock.module('../db/client', () => ({ client }));

const { requestContext } = await import('./request-context');
const { rateLimit } = await import('./ratelimit');

function createApp(name: string) {
  const app = new Hono();
  app.use('*', requestContext);
  app.use(
    '*',
    rateLimit({
      name,
      windowMs: 1_000,
      maxRequests: 1,
      requireIp: true,
    })
  );
  app.get('/', (c) => c.text('ok'));
  return app;
}

function createSocketServer(address: string) {
  return {
    requestIP: () => ({
      address,
      family: address.includes(':') ? 'IPv6' : 'IPv4',
      port: 1234,
    }),
  };
}

describe('rateLimit middleware', () => {
  const originalDateNow = Date.now;

  beforeEach(() => {
    postgresState.clear();
    config.trustProxy = false;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('resets the in-memory window exactly at the reset boundary', async () => {
    config.rateLimitBackend = 'memory';
    config.trustProxy = true;
    const app = createApp('memory-boundary');

    Date.now = () => 0;
    const first = await app.request('/', { headers: { 'X-Forwarded-For': '127.0.0.1' } });

    Date.now = () => 1_000;
    const second = await app.request('/', { headers: { 'X-Forwarded-For': '127.0.0.1' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('keeps postgres rate limiting in a sliding window across fixed-window boundaries', async () => {
    config.rateLimitBackend = 'postgres';
    config.trustProxy = true;
    const app = createApp('postgres-sliding');

    Date.now = () => 900;
    const first = await app.request('/', { headers: { 'X-Forwarded-For': '127.0.0.1' } });

    Date.now = () => 1_000;
    const second = await app.request('/', { headers: { 'X-Forwarded-For': '127.0.0.1' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('uses the socket address when proxy headers are not trusted', async () => {
    config.rateLimitBackend = 'memory';
    const app = createApp('socket-fallback');

    const first = await app.fetch(new Request('http://localhost/'), { server: createSocketServer('127.0.0.1') as never });
    const second = await app.fetch(new Request('http://localhost/'), { server: createSocketServer('127.0.0.1') as never });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('ignores forwarded headers when proxy trust is disabled', async () => {
    config.rateLimitBackend = 'memory';
    const app = createApp('ignore-forwarded');

    const first = await app.fetch(new Request('http://localhost/', {
      headers: {
        'X-Forwarded-For': '198.51.100.10',
      },
    }), { server: createSocketServer('127.0.0.1') as never });

    const second = await app.fetch(new Request('http://localhost/', {
      headers: {
        'X-Forwarded-For': '203.0.113.10',
      },
    }), { server: createSocketServer('127.0.0.1') as never });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('accepts ipv6 loopback socket addresses', async () => {
    config.rateLimitBackend = 'memory';
    const app = createApp('ipv6-loopback');

    const response = await app.fetch(new Request('http://localhost/'), { server: createSocketServer('::1') as never });

    expect(response.status).toBe(200);
  });
});
