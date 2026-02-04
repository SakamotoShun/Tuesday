import { Hono } from 'hono';
import { auth } from '../middleware';
import { notificationService } from '../services';
import { notificationRepository } from '../repositories';
import { success, errors } from '../utils/response';

const notifications = new Hono();

notifications.use('*', auth);

// GET /api/v1/notifications - List notifications
notifications.get('/', async (c) => {
  try {
    const user = c.get('user');
    const unreadOnly = c.req.query('unread') === 'true';
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Number(limitParam) : undefined;

    const items = await notificationService.getNotifications(user.id, { unreadOnly, limit });
    return success(c, items);
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
    const existing = await notificationRepository.findById(id);
    if (!existing || existing.userId !== user.id) {
      return errors.notFound(c, 'Notification not found');
    }

    const notification = await notificationService.markAsRead(id);
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
