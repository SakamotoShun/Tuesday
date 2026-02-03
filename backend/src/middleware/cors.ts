import type { Context, Next } from 'hono';
import { config } from '../config';

/**
 * CORS middleware - handles cross-origin requests
 */
export async function cors(c: Context, next: Next) {
  const origin = c.req.header('Origin') || config.corsOrigin;
  
  // Set CORS headers
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    c.status(204);
    return c.text('OK');
  }

  await next();
}
