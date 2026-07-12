import type { Context, Next } from 'hono';

/**
 * Permissive CORS for endpoints that authenticate with bearer tokens or serve
 * public metadata — never session cookies. Browser-based MCP connectors
 * (claude.ai, Claude Desktop, ChatGPT) call these from arbitrary HTTPS
 * origins, so unlike the strict /api/* policy we accept any https: origin and
 * never allow credentials.
 */

export interface PublicCorsOptions {
  allowMethods: string;
  allowHeaders: string;
  exposeHeaders?: string;
}

export const OAUTH_CORS_OPTIONS: PublicCorsOptions = {
  allowMethods: 'POST, OPTIONS',
  allowHeaders: 'Content-Type, Authorization',
};

export const MCP_CORS_OPTIONS: PublicCorsOptions = {
  allowMethods: 'GET, POST, DELETE, OPTIONS',
  allowHeaders: 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  // WWW-Authenticate must be readable cross-origin so browser clients can
  // bootstrap OAuth discovery from the 401 challenge.
  exposeHeaders: 'WWW-Authenticate, Mcp-Session-Id',
};

export function isAllowedPublicCorsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname));
  } catch {
    return false;
  }
}

export function setPublicCorsHeaders(c: Context, options: PublicCorsOptions): boolean {
  const origin = c.req.header('Origin');
  c.header('Access-Control-Allow-Methods', options.allowMethods);
  c.header('Access-Control-Allow-Headers', options.allowHeaders);
  c.header('Access-Control-Max-Age', '86400');

  if (!origin) return true;
  if (!isAllowedPublicCorsOrigin(origin)) return false;

  c.header('Access-Control-Allow-Origin', origin);
  c.header('Vary', 'Origin');
  if (options.exposeHeaders) {
    c.header('Access-Control-Expose-Headers', options.exposeHeaders);
  }
  return true;
}

export function publicEndpointCors(c: Context, options: PublicCorsOptions): Response | null {
  if (!setPublicCorsHeaders(c, options)) {
    return c.text('Origin not allowed', 403);
  }
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  return null;
}

export async function mcpCors(c: Context, next: Next) {
  if (!setPublicCorsHeaders(c, MCP_CORS_OPTIONS)) {
    return c.text('Origin not allowed', 403);
  }
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  await next();
}

/**
 * OAuth discovery metadata is public and credential-free, so the wildcard
 * origin is safe and cache-friendly. Returns the preflight response for
 * OPTIONS, null otherwise.
 */
export function wellKnownCors(c: Context): Response | null {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
  c.header('Access-Control-Max-Age', '86400');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  return null;
}
