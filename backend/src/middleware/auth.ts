import type { Context, Next } from 'hono';
import { authService } from '../services';
import { errors } from '../utils/response';
import type { User } from '../types';

// Extend Hono context to include user
declare module 'hono' {
  interface ContextVariableMap {
    user: User;
  }
}

/**
 * Auth middleware - validates session and sets user in context
 */
export async function auth(c: Context, next: Next) {
  const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];

  if (!sessionId) {
    return errors.unauthorized(c);
  }

  const user = await authService.validateSession(sessionId);

  if (!user) {
    return errors.unauthorized(c, 'Session expired or invalid');
  }

  // Set user in context for downstream handlers
  c.set('user', user);

  await next();
}

/**
 * Optional auth middleware - sets user if session exists, doesn't require it
 */
export async function optionalAuth(c: Context, next: Next) {
  const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];

  if (sessionId) {
    const user = await authService.validateSession(sessionId);
    if (user) {
      c.set('user', user);
    }
  }

  await next();
}
