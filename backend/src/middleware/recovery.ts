import type { Context, Next } from 'hono';
import { errors } from '../utils/response';

/**
 * Recovery middleware - handles panics/errors gracefully
 */
export async function recovery(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    console.error('Unhandled error:', err);
    
    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
      return errors.internal(c);
    }
    
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errors.internal(c, message);
  }
}
