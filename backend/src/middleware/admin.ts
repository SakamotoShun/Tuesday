import type { Context, Next } from 'hono';
import { UserRole } from '../db/schema';
import { errors } from '../utils/response';

/**
 * Middleware to require admin role
 * - Check if current user has admin role
 * - Returns 403 if not admin
 */
export async function requireAdmin(c: Context, next: Next) {
  const user = c.get('user');

  if (user.role !== UserRole.ADMIN) {
    return errors.forbidden(c, 'Admin access required');
  }

  await next();
}
