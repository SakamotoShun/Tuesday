import type { Context, Next } from 'hono';
import { errors } from '../utils/response';
import { config } from '../config';

// Simple in-memory rate limiter
// In production, use Redis or similar
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(options: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    if (!config.rateLimitEnabled) {
      return next();
    }

    const key = c.req.header('X-Forwarded-For') || 
                 c.req.header('X-Real-IP') || 
                 'unknown';
    
    const now = Date.now();
    const entry = rateLimits.get(key);

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      rateLimits.set(key, {
        count: 1,
        resetTime: now + options.windowMs,
      });
    } else {
      entry.count++;
      
      if (entry.count > options.maxRequests) {
        return errors.tooManyRequests(c);
      }
    }

    await next();
  };
}

// Predefined rate limits
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 requests per minute
});

export const setupRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});
