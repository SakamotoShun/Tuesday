import type { Context, Next } from 'hono';
import { config } from '../config';

/**
 * CORS middleware - handles cross-origin requests
 */
export async function cors(c: Context, next: Next) {
  const origin = c.req.header('Origin');
  const allowOrigin = origin && config.corsOrigins.includes(origin) ? origin : null;

  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-Id');
  c.header('Access-Control-Max-Age', '86400');

  if (origin && !allowOrigin) {
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
