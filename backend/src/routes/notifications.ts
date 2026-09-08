import { Hono } from 'hono';
import { auth } from '../middleware';
import { notificationService } from '../services';
import { success, errors } from '../utils/response';

const notifications = new Hono();

function decodeCursor(value: string): { createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') {
      return null;
    }
    const createdAt = new Date(parsed[0]);
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(parsed[1])) return null;
    return { createdAt, id: parsed[1] };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString('base64url');
}

notifications.use('*', auth);

// GET /api/v1/notifications - List notifications
notifications.get('/', async (c) => {
  try {
    const user = c.get('user');
    const unreadParam = c.req.query('unread');
    if (unreadParam !== undefined && unreadParam !== 'true' && unreadParam !== 'false') {
      return errors.badRequest(c, 'Invalid unread filter');
    }
    const unreadOnly = unreadParam === 'true';
    const limitParam = c.req.query('limit');
    const limit = limitParam === undefined ? 50 : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return errors.badRequest(c, 'Limit must be an integer between 1 and 100');
    }
    const cursorParam = c.req.query('cursor');
    const decodedCursor = cursorParam ? decodeCursor(cursorParam) : undefined;
    if (cursorParam && !decodedCursor) return errors.badRequest(c, 'Invalid notification cursor');
    const cursor = decodedCursor ?? undefined;

    const { items: page, unreadCount } = await notificationService.getNotificationPage(
      user.id,
      { unreadOnly, limit: limit + 1, cursor },
    );
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    const last = items.at(-1);
    return success(c, {
      items,
      unreadCount,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return errors.internal(c, 'Failed to fetch notifications');
  }
});

// PATCH /api/v1/notifications/:id/read - Mark a notification as read
notifications.patch('/:id/read', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const notification = await notificationService.markAsRead(id, user.id);
    if (!notification) {
      return errors.notFound(c, 'Notification not found');
    }

    return success(c, notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return errors.internal(c, 'Failed to update notification');
  }
});

// POST /api/v1/notifications/read-all - Mark all notifications as read
notifications.post('/read-all', async (c) => {
  try {
    const user = c.get('user');
    const count = await notificationService.markAllAsRead(user.id);
    return success(c, { updated: count });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return errors.internal(c, 'Failed to update notifications');
  }
});

export { notifications };
