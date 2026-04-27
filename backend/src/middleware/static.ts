import type { Context, Next } from 'hono';
import { config } from '../config';
import { extname, join, resolve, sep } from 'node:path';

/**
 * MIME type map for common static file extensions.
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export function isPathWithinDirectory(directoryPath: string, candidatePath: string) {
  const resolvedDirectoryPath = resolve(directoryPath);
  const resolvedCandidatePath = resolve(candidatePath);

  return resolvedCandidatePath === resolvedDirectoryPath
    || resolvedCandidatePath.startsWith(`${resolvedDirectoryPath}${sep}`);
}

/**
 * Static file serving middleware for production.
 * Serves the frontend build from STATIC_DIR and provides SPA fallback.
 *
 * - Requests to /api/* and /health are passed through to API handlers.
 * - Requests matching a file on disk are served with appropriate cache headers.
 * - All other requests serve index.html (SPA fallback for client-side routing).
 *
 * Disabled when config.staticDir is empty (development mode).
 */
export async function serveStatic(c: Context, next: Next) {
  // Skip if static serving is disabled
  if (!config.staticDir) {
    await next();
    return;
  }

  const path = c.req.path;

  // Skip API routes and health endpoints - let API handlers process these
  if (path.startsWith('/api/') || path === '/health' || path === '/ready') {
    await next();
    return;
  }

  // Try to serve the exact file requested (e.g. /assets/main-abc123.js)
  if (path !== '/') {
    const staticDir = resolve(config.staticDir);
    const filePath = resolve(staticDir, `.${path}`);

    // Prevent path traversal
    if (!isPathWithinDirectory(staticDir, filePath)) {
      await next();
      return;
    }

    const file = Bun.file(filePath);
    if (await file.exists()) {
      const headers: Record<string, string> = {
        'Content-Type': getMimeType(filePath),
      };

      // Long cache for hashed assets (Vite outputs to /assets/ with content hashes)
      if (path.startsWith('/assets/')) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      }

      return new Response(file, { headers });
    }
  }

  // SPA fallback - serve index.html for all non-file requests
  const indexPath = join(resolve(config.staticDir), 'index.html');
  const indexFile = Bun.file(indexPath);
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  await next();
}
