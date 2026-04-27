import type { Context, Next } from 'hono';
import { config } from '../config';
import { errors } from '../utils/response';
import { log } from '../utils/logger';
import { getRequestId } from './request-context';

/**
 * Recovery middleware - handles panics/errors gracefully
 */
export async function recovery(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    log('error', 'request.failed', {
      req_id: getRequestId(c),
      method: c.req.method,
      path: c.req.path,
      error: err,
    });
    
    // Don't expose internal errors in production
    if (config.nodeEnv === 'production') {
      return errors.internal(c);
    }
    
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errors.internal(c, message);
  }
}
