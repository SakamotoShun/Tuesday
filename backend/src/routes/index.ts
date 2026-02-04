import { Hono } from 'hono';
import { setupRouter } from './setup';
import { authRouter } from './auth';
import { projects } from './projects';
import { docs } from './docs';
import { tasks } from './tasks';
import { admin } from './admin';
import { collab } from './collab';

const routes = new Hono();

// API v1 routes
routes.route('/api/v1/setup', setupRouter);
routes.route('/api/v1/auth', authRouter);
routes.route('/api/v1/projects', projects);
routes.route('/api/v1/docs', docs);
routes.route('/api/v1/tasks', tasks);
routes.route('/api/v1/admin', admin);
routes.route('/api/v1/collab', collab);

// Health check
routes.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export { routes };
