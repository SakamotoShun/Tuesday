import { Hono } from 'hono';
import { activityService, dashboardService } from '../services';
import { auth } from '../middleware';
import { errors, success } from '../utils/response';

const dashboard = new Hono();

dashboard.use('*', auth);

// GET /api/v1/dashboard/stats - Aggregated dashboard metrics
dashboard.get('/stats', async (c) => {
  try {
    const user = c.get('user');
    const stats = await dashboardService.getStats(user);
    return success(c, stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return errors.internal(c, 'Failed to fetch dashboard stats');
  }
});

// GET /api/v1/dashboard/activity - Recent activity feed
dashboard.get('/activity', async (c) => {
  try {
    const user = c.get('user');
    const limitParam = c.req.query('limit');
    const parsedLimit = limitParam ? Number(limitParam) : 25;
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 25;
    const activity = await activityService.getRecentActivity(user, limit);
    return success(c, activity);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching dashboard activity:', error);
    return errors.internal(c, 'Failed to fetch dashboard activity');
  }
});

export { dashboard };
