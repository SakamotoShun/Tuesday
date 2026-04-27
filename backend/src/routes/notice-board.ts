import { Hono } from 'hono';
import { auth, requireAdmin } from '../middleware';
import { noticeBoardService } from '../services';
import { requireRouteParam } from '../utils/route-params';
import { success, errors } from '../utils/response';
import {
  createNoticeBoardItemSchema,
  formatValidationErrors,
  updateNoticeBoardItemSchema,
  validateBody,
} from '../utils/validation';

const noticeBoard = new Hono();

noticeBoard.use('*', auth);

// GET /api/v1/notice-board - List notice board items
noticeBoard.get('/', async (c) => {
  try {
    const items = await noticeBoardService.listItems();
    return success(c, items);
  } catch (error) {
    console.error('Error fetching notice board items:', error);
    return errors.internal(c, 'Failed to fetch notice board items');
  }
});

// POST /api/v1/notice-board - Create notice board item (admin only)
noticeBoard.post('/', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createNoticeBoardItemSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const item = await noticeBoardService.createItem(validation.data, user);
    return success(c, item, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating notice board item:', error);
    return errors.internal(c, 'Failed to create notice board item');
  }
});

// PATCH /api/v1/notice-board/:id - Update notice board item (admin only)
noticeBoard.patch('/:id', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const id = requireRouteParam(c, 'id');
    const body = await c.req.json();

    const validation = validateBody(updateNoticeBoardItemSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const item = await noticeBoardService.updateItem(id, validation.data, user);
    if (!item) {
      return errors.notFound(c, 'Notice board item');
    }

    return success(c, item);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating notice board item:', error);
    return errors.internal(c, 'Failed to update notice board item');
  }
});

// DELETE /api/v1/notice-board/:id - Delete notice board item (admin only)
noticeBoard.delete('/:id', requireAdmin, async (c) => {
  try {
    const id = requireRouteParam(c, 'id');
    const deleted = await noticeBoardService.deleteItem(id);
    if (!deleted) {
      return errors.notFound(c, 'Notice board item');
    }
    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting notice board item:', error);
    return errors.internal(c, 'Failed to delete notice board item');
  }
});

// PATCH /api/v1/notice-board/:id/toggle - Toggle todo completion
noticeBoard.patch('/:id/toggle', async (c) => {
  try {
    const user = c.get('user');
    const id = requireRouteParam(c, 'id');

    const item = await noticeBoardService.toggleItem(id, user);
    if (!item) {
      return errors.notFound(c, 'Notice board item');
    }

    return success(c, item);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error toggling notice board item:', error);
    return errors.internal(c, 'Failed to toggle notice board item');
  }
});

export { noticeBoard };
