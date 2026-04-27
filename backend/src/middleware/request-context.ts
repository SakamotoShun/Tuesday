import { randomUUID } from 'node:crypto';
import type { Context, Next } from 'hono';
import { getClientIp } from '../utils/client-ip';

export const REQUEST_ID_HEADER = 'X-Request-Id';

declare module 'hono' {
  interface ContextVariableMap {
    clientIp: string | null;
    requestId: string;
  }
}

export async function requestContext(c: Context, next: Next) {
  const requestId = c.req.header(REQUEST_ID_HEADER) || randomUUID();
  c.set('clientIp', getClientIp(c));
  c.set('requestId', requestId);
  c.header(REQUEST_ID_HEADER, requestId);
  await next();
}

export function getRequestClientIp(c: Context) {
  return c.get('clientIp') ?? getClientIp(c);
}

export function getRequestId(c: Context) {
  return c.get('requestId');
}
