import type { Context } from 'hono';

// Success response
export function success<T>(c: Context, data: T, meta?: Record<string, unknown>, status: 200 | 201 = 200) {
  return c.json({ data, ...(meta && { meta }) }, status);
}

// Error response
export function error(
  c: Context,
  code: string,
  message: string,
  details?: Array<{ field: string; message: string }>,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500 = 400
) {
  return c.json(
    {
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    status
  );
}

// Common error helpers
export const errors = {
  validation: (c: Context, details: Array<{ field: string; message: string }>) =>
    error(c, 'VALIDATION_ERROR', 'Invalid input', details, 400),

  unauthorized: (c: Context, message = 'Authentication required') =>
    error(c, 'UNAUTHORIZED', message, undefined, 401),

  forbidden: (c: Context, message = 'Access denied') =>
    error(c, 'FORBIDDEN', message, undefined, 403),

  notFound: (c: Context, resource = 'Resource') =>
    error(c, 'NOT_FOUND', `${resource} not found`, undefined, 404),

  conflict: (c: Context, message: string) =>
    error(c, 'CONFLICT', message, undefined, 409),

  tooManyRequests: (c: Context, message = 'Too many requests') =>
    error(c, 'TOO_MANY_REQUESTS', message, undefined, 429),

  internal: (c: Context, message = 'Internal server error') =>
    error(c, 'INTERNAL_ERROR', message, undefined, 500),
};
