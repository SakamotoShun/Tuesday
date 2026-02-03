import { Hono } from 'hono';
import { projectStatusRepository, taskStatusRepository } from '../repositories';
import { auth, requireAdmin } from '../middleware';
import { success, errors } from '../utils/response';
import { 
  validateBody, 
  formatValidationErrors,
  createStatusSchema, 
  updateStatusSchema,
  reorderStatusSchema,
} from '../utils/validation';

const admin = new Hono();

// All admin routes require authentication and admin role
admin.use('*', auth, requireAdmin);

// ========== PROJECT STATUSES ==========

// GET /api/v1/admin/statuses/project - List project statuses
admin.get('/statuses/project', async (c) => {
  try {
    const statuses = await projectStatusRepository.findAll();
    return success(c, statuses);
  } catch (error) {
    console.error('Error fetching project statuses:', error);
    return errors.internal(c, 'Failed to fetch project statuses');
  }
});

// POST /api/v1/admin/statuses/project - Create project status
admin.post('/statuses/project', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(createStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await projectStatusRepository.create(validation.data);
    return success(c, status, undefined, 201);
  } catch (error) {
    console.error('Error creating project status:', error);
    return errors.internal(c, 'Failed to create status');
  }
});

// PATCH /api/v1/admin/statuses/project/:id - Update project status
admin.patch('/statuses/project/:id', async (c) => {
  try {
    const statusId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await projectStatusRepository.update(statusId, validation.data);

    if (!status) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, status);
  } catch (error) {
    console.error('Error updating project status:', error);
    return errors.internal(c, 'Failed to update status');
  }
});

// DELETE /api/v1/admin/statuses/project/:id - Delete project status
admin.delete('/statuses/project/:id', async (c) => {
  try {
    const statusId = c.req.param('id');

    const deleted = await projectStatusRepository.delete(statusId);

    if (!deleted) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting project status:', error);
    return errors.internal(c, 'Failed to delete status');
  }
});

// POST /api/v1/admin/statuses/project/reorder - Reorder project statuses
admin.post('/statuses/project/reorder', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(reorderStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    await projectStatusRepository.reorder(validation.data.ids);
    return success(c, { reordered: true });
  } catch (error) {
    console.error('Error reordering project statuses:', error);
    return errors.internal(c, 'Failed to reorder statuses');
  }
});

// ========== TASK STATUSES ==========

// GET /api/v1/admin/statuses/task - List task statuses
admin.get('/statuses/task', async (c) => {
  try {
    const statuses = await taskStatusRepository.findAll();
    return success(c, statuses);
  } catch (error) {
    console.error('Error fetching task statuses:', error);
    return errors.internal(c, 'Failed to fetch task statuses');
  }
});

// POST /api/v1/admin/statuses/task - Create task status
admin.post('/statuses/task', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(createStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await taskStatusRepository.create(validation.data);
    return success(c, status, undefined, 201);
  } catch (error) {
    console.error('Error creating task status:', error);
    return errors.internal(c, 'Failed to create status');
  }
});

// PATCH /api/v1/admin/statuses/task/:id - Update task status
admin.patch('/statuses/task/:id', async (c) => {
  try {
    const statusId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await taskStatusRepository.update(statusId, validation.data);

    if (!status) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, status);
  } catch (error) {
    console.error('Error updating task status:', error);
    return errors.internal(c, 'Failed to update status');
  }
});

// DELETE /api/v1/admin/statuses/task/:id - Delete task status
admin.delete('/statuses/task/:id', async (c) => {
  try {
    const statusId = c.req.param('id');

    const deleted = await taskStatusRepository.delete(statusId);

    if (!deleted) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting task status:', error);
    return errors.internal(c, 'Failed to delete status');
  }
});

// POST /api/v1/admin/statuses/task/reorder - Reorder task statuses
admin.post('/statuses/task/reorder', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(reorderStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    await taskStatusRepository.reorder(validation.data.ids);
    return success(c, { reordered: true });
  } catch (error) {
    console.error('Error reordering task statuses:', error);
    return errors.internal(c, 'Failed to reorder statuses');
  }
});

export { admin };
