import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Hono, type Context } from 'hono';

const config = {
  trustProxy: false,
  trustedProxyHops: 1,
};

mock.module('../config', () => ({ config }));

const { getClientIp, getForwardedClientIp, getSocketClientIp, normalizeIp } = await import('./client-ip');

function createSocketServer(address: string) {
  return {
    requestIP: () => ({
      address,
      family: address.includes(':') ? 'IPv6' : 'IPv4',
      port: 1234,
    }),
  };
}

function createApp(handler: (c: Context) => Response | Promise<Response>) {
  const app = new Hono();
  app.get('/', handler);
  return app;
}

describe('client IP utilities', () => {
  beforeEach(() => {
    config.trustProxy = false;
    config.trustedProxyHops = 1;
  });

  it('normalizes bracketed ipv6 and ipv4 port values', () => {
    expect(normalizeIp('[::1]:8080')).toBe('::1');
    expect(normalizeIp('127.0.0.1:3000')).toBe('127.0.0.1');
    expect(normalizeIp('unknown')).toBeNull();
  });

  it('uses the rightmost untrusted forwarded address when proxy trust is enabled', async () => {
    config.trustProxy = true;
    const app = createApp((c) => c.text(getForwardedClientIp(c) || 'missing'));

    const response = await app.request('http://localhost/', {
      headers: {
        'X-Forwarded-For': '198.51.100.1, 203.0.113.1',
      },
    });

    expect(await response.text()).toBe('203.0.113.1');
  });

  it('can skip multiple trusted proxy hops from the right', async () => {
    config.trustProxy = true;
    config.trustedProxyHops = 2;
    const app = createApp((c) => c.text(getForwardedClientIp(c) || 'missing'));

    const response = await app.request('http://localhost/', {
      headers: {
        'X-Forwarded-For': '198.51.100.1, 203.0.113.1, 203.0.113.2',
      },
    });

    expect(await response.text()).toBe('203.0.113.1');
  });

  it('uses x-real-ip when forwarded-for is absent and proxy trust is enabled', async () => {
    config.trustProxy = true;
    const app = createApp((c) => c.text(getForwardedClientIp(c) || 'missing'));

    const response = await app.request('http://localhost/', {
      headers: {
        'X-Real-IP': '198.51.100.2',
      },
    });

    expect(await response.text()).toBe('198.51.100.2');
  });

  it('uses socket information when proxy headers are not trusted', async () => {
    const app = createApp((c) => c.text(getClientIp(c) || 'missing'));

    const response = await app.fetch(new Request('http://localhost/'), {
      server: createSocketServer('127.0.0.1') as never,
    });

    expect(await response.text()).toBe('127.0.0.1');
  });

  it('preserves ipv6 socket addresses', async () => {
    const app = createApp((c) => c.text(getSocketClientIp(c) || 'missing'));

    const response = await app.fetch(new Request('http://localhost/'), {
      server: createSocketServer('::1') as never,
    });

    expect(await response.text()).toBe('::1');
  });

  it('returns null cleanly when socket information is unavailable', async () => {
    const app = createApp((c) => c.text(getSocketClientIp(c) || 'missing'));

    const response = await app.request('http://localhost/');

    expect(await response.text()).toBe('missing');
  });
});
