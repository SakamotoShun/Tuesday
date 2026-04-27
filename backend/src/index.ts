import 'dotenv/config';
import { Hono } from 'hono';
import { config } from './config';
import { routes } from './routes';
import { requestContext, recovery, logging, cors, securityHeaders, serveStatic } from './middleware';
import { websocket } from './websocket';
import { log } from './utils/logger';
import { runTrackedCleanupJob, type CleanupJobName } from './runtime';
import { client } from './db/client';
import { chatHub } from './collab/chatHub';
import { docCollabHub } from './collab/hub';
import { whiteboardCollabHub } from './collab/whiteboardHub';

const app = new Hono();
const cleanupHandles: Array<ReturnType<typeof setInterval>> = [];
const SHUTDOWN_TIMEOUT_MS = 25_000;

// Global middleware
app.use('*', requestContext);
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

    const scheduleCleanupJob = (name: CleanupJobName, intervalMs: number, task: () => Promise<number>) => {
      const handle = setInterval(async () => {
        try {
          const deleted = await runTrackedCleanupJob(name, task);
          if (deleted > 0) {
            log('info', 'cleanup.completed', {
              job: name,
              deleted_count: deleted,
            });
          }
        } catch (error) {
          log('error', 'cleanup.failed', {
            job: name,
            error,
          });
        }
      }, intervalMs);
      cleanupHandles.push(handle);
    };
    
    // Clean up old sessions periodically
    scheduleCleanupJob('expiredSessions', 60 * 60 * 1000, async () => {
      const { sessionRepository } = await import('./repositories');
      return sessionRepository.deleteExpired();
    });

    // Clean up expired and consumed auth tokens periodically
    scheduleCleanupJob('expiredAuthTokens', 60 * 60 * 1000, async () => {
      const { authService } = await import('./services/auth');
      return authService.cleanupExpiredTokens();
    });

    // Clean up expired pending files periodically
    scheduleCleanupJob('expiredPendingFiles', 5 * 60 * 1000, async () => {
      const { fileService } = await import('./services/file');
      return fileService.cleanupExpiredFiles();
    });

    // Clean up orphaned files periodically (attached status but no reference)
    scheduleCleanupJob('orphanedFiles', 60 * 60 * 1000, async () => {
      const { fileService } = await import('./services/file');
      return fileService.cleanupOrphanedFiles();
    });

    // Clean up files from soft-deleted messages (daily)
    scheduleCleanupJob('deletedMessageFiles', 24 * 60 * 60 * 1000, async () => {
      const { fileService } = await import('./services/file');
      const { config } = await import('./config');
      return fileService.cleanupDeletedMessageFiles(config.deletedMessageFileRetentionDays);
    });

    const server = Bun.serve({
      port: config.port,
      fetch: app.fetch,
      websocket,
    });

    let shutdownPromise: Promise<void> | null = null;

    const shutdown = async (signal: string) => {
      if (shutdownPromise) {
        await shutdownPromise;
        return;
      }

      shutdownPromise = (async () => {
        log('info', 'server.shutdown_started', { signal, timeout_ms: SHUTDOWN_TIMEOUT_MS });

        chatHub.shutdown();
        docCollabHub.shutdown();
        whiteboardCollabHub.shutdown();

        const forceCloseTimer = setTimeout(() => {
          void server.stop(true);
        }, SHUTDOWN_TIMEOUT_MS);

        forceCloseTimer.unref?.();

        await server.stop(false);
        clearTimeout(forceCloseTimer);

        log('info', 'server.network_stopped', { signal });

      for (const handle of cleanupHandles) {
        clearInterval(handle);
      }

        await client.end({ timeout: 5 });
        log('info', 'server.shutdown_completed', { signal });
      })();

      try {
        await shutdownPromise;
        process.exit(0);
      } catch (error) {
        log('error', 'server.shutdown_failed', { signal, error });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('unhandledRejection', (error) => {
      log('error', 'process.unhandled_rejection', { error });
      void shutdown('unhandledRejection');
    });
    process.on('uncaughtException', (error) => {
      log('error', 'process.uncaught_exception', { error });
      void shutdown('uncaughtException');
    });

    log('info', 'server.started', { port: config.port });
  } catch (error) {
    log('error', 'server.start_failed', { error });
    process.exit(1);
  }
}

startServer();
