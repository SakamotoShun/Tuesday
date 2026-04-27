import { randomUUID } from 'node:crypto';
import type { Context, Next } from 'hono';

export const REQUEST_ID_HEADER = 'X-Request-Id';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export async function requestContext(c: Context, next: Next) {
  const requestId = c.req.header(REQUEST_ID_HEADER) || randomUUID();
  c.set('requestId', requestId);
  c.header(REQUEST_ID_HEADER, requestId);
  await next();
}

export function getRequestId(c: Context) {
  return c.get('requestId');
}
