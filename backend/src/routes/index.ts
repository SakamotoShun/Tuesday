import { Hono } from 'hono';
import { setupRouter } from './setup';
import { authRouter } from './auth';
import { projects } from './projects';
import { docs } from './docs';
import { tasks } from './tasks';
import { statuses } from './statuses';
import { admin } from './admin';
import { bots } from './bots';
import { collab } from './collab';
import { meetings } from './meetings';
import { whiteboards } from './whiteboards';
import { chat } from './chat';
import { dms } from './dms';
import { notifications } from './notifications';
import { files } from './files';
import { users } from './users';
import { profile } from './profile';
import { ws } from './ws';
import { teams } from './teams';
import { webhooks } from './webhooks';
import { timeEntries } from './time-entries';
import { search } from './search';

const routes = new Hono();

// API v1 routes
routes.route('/api/v1/setup', setupRouter);
routes.route('/api/v1/auth', authRouter);
routes.route('/api/v1/projects', projects);
routes.route('/api/v1/docs', docs);
routes.route('/api/v1/tasks', tasks);
routes.route('/api/v1/statuses', statuses);
routes.route('/api/v1/admin', admin);
routes.route('/api/v1/admin/bots', bots);
routes.route('/api/v1/collab', collab);
routes.route('/api/v1/meetings', meetings);
routes.route('/api/v1/whiteboards', whiteboards);
routes.route('/api/v1/channels', chat);
routes.route('/api/v1/dms', dms);
routes.route('/api/v1/users', users);
routes.route('/api/v1/profile', profile);
routes.route('/api/v1/files', files);
routes.route('/api/v1/notifications', notifications);
routes.route('/api/v1/ws', ws);
routes.route('/api/v1/teams', teams);
routes.route('/api/v1/webhooks', webhooks);
routes.route('/api/v1/time-entries', timeEntries);
routes.route('/api/v1/search', search);

// Health check
routes.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export { routes };
