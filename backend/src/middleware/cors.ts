import type { Context, Next } from 'hono';
import { config } from '../config';

function getForwardedHeaderValue(value: string | undefined) {
  return value?.split(',')[0]?.trim() || null;
}

function getEffectiveRequestUrl(c: Context) {
  if (config.trustProxy) {
    const forwardedProto = getForwardedHeaderValue(c.req.header('X-Forwarded-Proto'));
    const forwardedHost = getForwardedHeaderValue(c.req.header('X-Forwarded-Host'));

    if (forwardedProto && forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }
  }

  const host = c.req.header('Host');
  if (host) {
    return `${new URL(c.req.url).protocol}//${host}`;
  }

  return c.req.url;
}

function isSameOrigin(origin: string, requestUrl: string) {
  try {
    const originUrl = new URL(origin);
    const targetUrl = new URL(requestUrl);
    return originUrl.protocol === targetUrl.protocol && originUrl.host === targetUrl.host;
  } catch {
    return false;
  }
}

function isSameOriginWithPublicBaseUrl(origin: string) {
  if (!config.publicBaseUrl) {
    return false;
  }

  return isSameOrigin(origin, config.publicBaseUrl);
}

function isAllowedDevelopmentOrigin(origin: string) {
  if (config.nodeEnv !== 'development') {
    return false;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    return isAllowedDevelopmentHostname(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedDevelopmentHostname(hostname: string) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
    return true;
  }

  const ipv4Segments = hostname.split('.').map((segment) => Number.parseInt(segment, 10));
  if (ipv4Segments.length !== 4 || ipv4Segments.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 255)) {
    return false;
  }

  const [first, second] = ipv4Segments;

  // Tailscale uses 100.64.0.0/10 for node addresses.
  return first === 100 && second >= 64 && second <= 127;
}

/**
 * CORS middleware - handles cross-origin requests
 */
export async function cors(c: Context, next: Next) {
  const origin = c.req.header('Origin');
  const allowOrigin = origin && (config.corsOrigins.includes(origin) || isAllowedDevelopmentOrigin(origin)) ? origin : null;
  const sameOrigin = origin
    ? isSameOrigin(origin, getEffectiveRequestUrl(c)) || isSameOriginWithPublicBaseUrl(origin)
    : false;

  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-Id');
  c.header('Access-Control-Max-Age', '86400');

  if (origin && !allowOrigin && !sameOrigin) {
    c.status(403);
    return c.text('Origin not allowed');
  }

  if (allowOrigin) {
    c.header('Access-Control-Allow-Origin', allowOrigin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
  }

  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    c.status(204);
    return c.text('OK');
  }

  await next();
}
