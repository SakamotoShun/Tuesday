import { Hono } from 'hono';
import { setupRouter } from './setup';
import { authRouter } from './auth';

const routes = new Hono();

// API v1 routes
routes.route('/api/v1/setup', setupRouter);
routes.route('/api/v1/auth', authRouter);

// Health check
routes.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export { routes };
