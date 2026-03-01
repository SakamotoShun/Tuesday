import 'dotenv/config';
import { Hono } from 'hono';
import { config } from './config';
import { routes } from './routes';
import { recovery, logging, cors, securityHeaders, serveStatic } from './middleware';
import { websocket } from './websocket';

const app = new Hono();

// Global middleware
app.use('*', recovery);
app.use('*', logging);
app.use('*', cors);
app.use('*', securityHeaders);

// Mount routes
app.route('/', routes);

// Serve frontend static files and SPA fallback (production only)
app.use('*', serveStatic);

// 404 handler
app.notFound((c) => {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
});

// Run migrations and start server
async function startServer() {
  try {
    // Run migrations
    const { runMigrations } = await import('./db/migrate');
    await runMigrations();
    
    // Clean up old sessions periodically
    setInterval(async () => {
      try {
        const { sessionRepository } = await import('./repositories');
        const deleted = await sessionRepository.deleteExpired();
        if (deleted > 0) {
          console.log(`🧹 Cleaned up ${deleted} expired sessions`);
        }
      } catch (error) {
        console.error('Error cleaning up expired sessions:', error);
      }
    }, 60 * 60 * 1000); // Every hour

    // Clean up expired and consumed auth tokens periodically
    setInterval(async () => {
      try {
        const { authService } = await import('./services/auth');
        const deleted = await authService.cleanupExpiredTokens();
        if (deleted > 0) {
          console.log(`🧹 Cleaned up ${deleted} expired auth tokens`);
        }
      } catch (error) {
        console.error('Error cleaning up auth tokens:', error);
      }
    }, 60 * 60 * 1000); // Every hour

    // Clean up expired pending files periodically
    setInterval(async () => {
      try {
        const { fileService } = await import('./services/file');
        const deleted = await fileService.cleanupExpiredFiles();
        if (deleted > 0) {
          console.log(`🧹 Cleaned up ${deleted} expired pending files`);
        }
      } catch (error) {
        console.error('Error cleaning up expired files:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Clean up orphaned files periodically (attached status but no reference)
    setInterval(async () => {
      try {
        const { fileService } = await import('./services/file');
        const deleted = await fileService.cleanupOrphanedFiles();
        if (deleted > 0) {
          console.log(`🧹 Cleaned up ${deleted} orphaned files`);
        }
      } catch (error) {
        console.error('Error cleaning up orphaned files:', error);
      }
    }, 60 * 60 * 1000); // Every hour

    // Clean up files from soft-deleted messages (daily)
    setInterval(async () => {
      try {
        const { fileService } = await import('./services/file');
        const { config } = await import('./config');
        const deleted = await fileService.cleanupDeletedMessageFiles(config.deletedMessageFileRetentionDays);
        if (deleted > 0) {
          console.log(`🧹 Cleaned up ${deleted} files from deleted messages`);
        }
      } catch (error) {
        console.error('Error cleaning up deleted message files:', error);
      }
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    // Explicitly start Bun server with WebSocket support
    Bun.serve({
      port: config.port,
      fetch: app.fetch,
      websocket,
    });

    console.log(`🚀 Tuesday backend running on port ${config.port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
