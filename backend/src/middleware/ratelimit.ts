import type { Context, Next } from 'hono';
import { errors } from '../utils/response';
import { config } from '../config';
import { client } from '../db/client';
import { log } from '../utils/logger';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const MEMORY_SWEEP_INTERVAL_MS = 60 * 1000;
const POSTGRES_SWEEP_INTERVAL_MS = 60 * 1000;

let lastMemorySweepAt = 0;
let lastPostgresSweepAt = 0;

interface RateLimitOptions {
  name: string;
  windowMs: number;
  maxRequests: number;
  requireIp?: boolean;
  missingIpMessage?: string;
}

interface RateLimitResult {
  count: number;
  resetTime: number;
}

function normalizeIp(value: string) {
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

function getClientIp(c: Context) {
  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    for (const entry of forwardedFor.split(',')) {
      const normalized = normalizeIp(entry);
      if (normalized) {
        return normalized;
      }
    }
  }

  const realIp = normalizeIp(c.req.header('X-Real-IP') || '');
  if (realIp) {
    return realIp;
  }

  return null;
}

function getRateLimitKey(c: Context, requireIp: boolean) {
  const clientIp = getClientIp(c);
  if (clientIp) {
    return clientIp;
  }

  if (requireIp) {
    return null;
  }

  const userAgent = c.req.header('User-Agent')?.trim();
  if (userAgent) {
    return `ua:${userAgent}`;
  }

  return `path:${c.req.path}`;
}

function setRateLimitHeaders(c: Context, options: RateLimitOptions, result: RateLimitResult, now: number, limited: boolean) {
  const remaining = Math.max(0, options.maxRequests - result.count);
  const resetSeconds = Math.max(0, Math.ceil((result.resetTime - now) / 1000));

  c.header('X-RateLimit-Limit', String(options.maxRequests));
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));

  if (limited) {
    c.header('Retry-After', String(resetSeconds));
  }
}

function maybeSweepMemoryEntries(now: number) {
  if (now - lastMemorySweepAt < MEMORY_SWEEP_INTERVAL_MS) {
    return;
  }

  lastMemorySweepAt = now;

  for (const [key, entry] of rateLimits.entries()) {
    if (entry.resetTime <= now) {
      rateLimits.delete(key);
    }
  }
}

function consumeMemoryRateLimit(key: string, options: RateLimitOptions, now: number): RateLimitResult {
  maybeSweepMemoryEntries(now);
  const namespacedKey = `${options.name}:${key}`;
  const entry = rateLimits.get(namespacedKey);

  if (!entry || now >= entry.resetTime) {
    const nextEntry = {
      count: 1,
      resetTime: now + options.windowMs,
    };
    rateLimits.set(namespacedKey, nextEntry);
    return nextEntry;
  }

  entry.count += 1;
  return entry;
}

async function maybeSweepPostgresEntries(now: number) {
  if (now - lastPostgresSweepAt < POSTGRES_SWEEP_INTERVAL_MS) {
    return;
  }

  lastPostgresSweepAt = now;

  try {
    await client`DELETE FROM rate_limit_entries WHERE expires_at <= NOW()`;
  } catch (error) {
    log('warn', 'rate_limit.cleanup_failed', {
      backend: 'postgres',
      error,
    });
  }
}

async function consumePostgresRateLimit(key: string, options: RateLimitOptions, now: number): Promise<RateLimitResult> {
  await maybeSweepPostgresEntries(now);

  const currentTime = new Date(now);
  const nextResetTime = new Date(now + options.windowMs);

  const [row] = await client<{ count: number; reset_time: number }[]>`
    INSERT INTO rate_limit_entries (scope, client_key, first_request_at, request_count, expires_at, updated_at)
    VALUES (
      ${options.name},
      ${key},
      ${currentTime},
      1,
      ${nextResetTime},
      NOW()
    )
    ON CONFLICT (scope, client_key)
    DO UPDATE SET
      request_count = CASE
        WHEN rate_limit_entries.expires_at <= ${currentTime} THEN 1
        ELSE rate_limit_entries.request_count + 1
      END,
      first_request_at = CASE
        WHEN rate_limit_entries.expires_at <= ${currentTime} THEN EXCLUDED.first_request_at
        ELSE rate_limit_entries.first_request_at
      END,
      expires_at = CASE
        WHEN rate_limit_entries.expires_at <= ${currentTime} THEN EXCLUDED.expires_at
        ELSE rate_limit_entries.expires_at
      END,
      updated_at = NOW()
    RETURNING request_count::int AS count, (EXTRACT(EPOCH FROM expires_at) * 1000)::bigint AS reset_time
  `;

  return {
    count: Number(row?.count ?? 1),
    resetTime: Number(row?.reset_time ?? nextResetTime.getTime()),
  };
}

async function consumeRateLimit(key: string, options: RateLimitOptions, now: number) {
  if (config.rateLimitBackend === 'postgres') {
    return consumePostgresRateLimit(key, options, now);
  }

  return consumeMemoryRateLimit(key, options, now);
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(options: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    if (!config.rateLimitEnabled) {
      return next();
    }

    const key = getRateLimitKey(c, options.requireIp ?? false);
    if (!key) {
      return errors.badRequest(c, options.missingIpMessage || 'Unable to determine client IP');
    }

    const now = Date.now();
    const result = await consumeRateLimit(key, options, now);
    const limited = result.count > options.maxRequests;

    setRateLimitHeaders(c, options, result, now, limited);

    if (limited) {
      return errors.tooManyRequests(c);
    }

    return next();
  };
}

// Predefined rate limits
export const authRateLimit = rateLimit({
  name: 'auth',
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 requests per minute
  requireIp: true,
  missingIpMessage: 'Unable to determine client IP for authentication request',
});

export const setupRateLimit = rateLimit({
  name: 'setup',
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute
  requireIp: true,
  missingIpMessage: 'Unable to determine client IP for setup request',
});

export const generalRateLimit = rateLimit({
  name: 'general',
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});

export const webhookRateLimit = rateLimit({
  name: 'webhook',
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute
});
