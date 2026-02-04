import { Hono } from 'hono';
import { whiteboardService } from '../services';
import { auth, requireProjectAccess } from '../middleware';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createWhiteboardSchema, updateWhiteboardSchema } from '../utils/validation';

const whiteboards = new Hono();

// All whiteboard routes require authentication
whiteboards.use('*', auth);

// GET /api/v1/whiteboards/projects/:id/whiteboards - List project whiteboards
whiteboards.get('/projects/:id/whiteboards', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const projectWhiteboards = await whiteboardService.getProjectWhiteboards(projectId, user);
    return success(c, projectWhiteboards);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching whiteboards:', error);
    return errors.internal(c, 'Failed to fetch whiteboards');
  }
});

// POST /api/v1/whiteboards/projects/:id/whiteboards - Create whiteboard in project
whiteboards.post('/projects/:id/whiteboards', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(createWhiteboardSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const whiteboard = await whiteboardService.createWhiteboard(projectId, validation.data, user);
    return success(c, whiteboard, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating whiteboard:', error);
    return errors.internal(c, 'Failed to create whiteboard');
  }
});

// GET /api/v1/whiteboards/:id - Get whiteboard
whiteboards.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const whiteboardId = c.req.param('id');

    const whiteboard = await whiteboardService.getWhiteboard(whiteboardId, user);

    if (!whiteboard) {
      return errors.notFound(c, 'Whiteboard not found');
    }

    return success(c, whiteboard);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching whiteboard:', error);
    return errors.internal(c, 'Failed to fetch whiteboard');
  }
});

// PATCH /api/v1/whiteboards/:id - Update whiteboard
whiteboards.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const whiteboardId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateWhiteboardSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const whiteboard = await whiteboardService.updateWhiteboard(whiteboardId, validation.data, user);

    if (!whiteboard) {
      return errors.notFound(c, 'Whiteboard not found');
    }

    return success(c, whiteboard);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating whiteboard:', error);
    return errors.internal(c, 'Failed to update whiteboard');
  }
});

// DELETE /api/v1/whiteboards/:id - Delete whiteboard
whiteboards.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const whiteboardId = c.req.param('id');

    const deleted = await whiteboardService.deleteWhiteboard(whiteboardId, user);

    if (!deleted) {
      return errors.notFound(c, 'Whiteboard not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting whiteboard:', error);
    return errors.internal(c, 'Failed to delete whiteboard');
  }
});

export { whiteboards };
