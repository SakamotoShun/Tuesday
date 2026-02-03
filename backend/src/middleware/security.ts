import type { Context, Next } from 'hono';

/**
 * Security headers middleware
 */
export async function securityHeaders(c: Context, next: Next) {
  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  c.header('X-Frame-Options', 'DENY');
  
  // XSS protection (for older browsers)
  c.header('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:;"
  );
  
  // HSTS (only in production)
  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  await next();
}
