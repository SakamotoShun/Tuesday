import type { Context, Next } from 'hono';

/**
 * Logging middleware - logs requests and responses
 */
export async function logging(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // Log format: [timestamp] METHOD path status - duration
  console.log(`[${new Date().toISOString()}] ${method} ${path} ${status} - ${duration}ms`);
}
