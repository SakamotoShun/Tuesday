import type { Context } from 'hono';

export function requireRouteParam(c: Context, name: string) {
  const value = c.req.param(name);

  if (!value) {
    throw new Error(`Missing route parameter: ${name}`);
  }

  return value;
}
