import 'dotenv/config';
import { Hono } from 'hono';
import { config } from './config';
import { routes } from './routes';
import { recovery, logging, cors, securityHeaders } from './middleware';
import { websocket } from './websocket';

const app = new Hono();

// Global middleware
app.use('*', recovery);
app.use('*', logging);
app.use('*', cors);
app.use('*', securityHeaders);

// Mount routes
app.route('/', routes);

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
