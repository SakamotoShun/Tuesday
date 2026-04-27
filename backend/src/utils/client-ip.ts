import type { Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { config } from '../config';

export function normalizeIp(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.toLowerCase() === 'unknown') {
    return null;
  }

  if (trimmed.startsWith('[')) {
    const closingIndex = trimmed.indexOf(']');
    if (closingIndex > 1) {
      return trimmed.slice(1, closingIndex);
    }
  }

  const ipv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/);
  if (ipv4WithPort) {
    return ipv4WithPort[1];
  }

  return trimmed;
}

export function getForwardedClientIp(c: Context) {
  if (!config.trustProxy) {
    return null;
  }

  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    const entries = forwardedFor
      .split(',')
      .map((entry) => normalizeIp(entry))
      .filter((entry): entry is string => entry !== null);
    const clientIndex = entries.length - (config.trustedProxyHops || 1);

    if (clientIndex >= 0) {
      return entries[clientIndex] || null;
    }
  }

  return normalizeIp(c.req.header('X-Real-IP') || '');
}

export function getSocketClientIp(c: Context) {
  try {
    const info = getConnInfo(c);
    return info.remote.address ? normalizeIp(info.remote.address) : null;
  } catch {
    return null;
  }
}

export function getClientIp(c: Context) {
  return getForwardedClientIp(c) ?? getSocketClientIp(c);
}
