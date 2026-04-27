import type { Context, Next } from 'hono';
import { getRequestClientIp, getRequestId } from './request-context';
import { log } from '../utils/logger';

/**
 * Logging middleware - logs requests and responses
 */
export async function logging(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const requestId = getRequestId(c);
  const ip = getRequestClientIp(c) ?? 'unknown';

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const user = c.get('user');

  log('info', 'request.completed', {
    req_id: requestId,
    method,
    path,
    status,
    duration_ms: duration,
    ip,
    user_id: user?.id ?? null,
  });
}
