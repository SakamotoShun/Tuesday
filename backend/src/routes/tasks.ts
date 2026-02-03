import { Hono } from 'hono';
import { taskService } from '../services';
import { auth, requireProjectAccess } from '../middleware';
import { success, errors } from '../utils/response';
import { 
  validateBody, 
  formatValidationErrors,
  createTaskSchema, 
  updateTaskSchema, 
  updateTaskStatusSchema,
  updateTaskOrderSchema,
  updateTaskAssigneesSchema,
} from '../utils/validation';

const tasks = new Hono();

// All task routes require authentication
tasks.use('*', auth);

// GET /api/v1/projects/:id/tasks - List project tasks
tasks.get('/projects/:id/tasks', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    
    // Parse query filters
    const query = c.req.query();
    const filters = {
      statusId: query.statusId,
      assigneeId: query.assigneeId,
    };

    const projectTasks = await taskService.getProjectTasks(projectId, user, filters);
    return success(c, projectTasks);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching tasks:', error);
    return errors.internal(c, 'Failed to fetch tasks');
  }
});

// POST /api/v1/projects/:id/tasks - Create task in project
tasks.post('/projects/:id/tasks', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(createTaskSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const task = await taskService.createTask(projectId, validation.data, user);
    return success(c, task, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating task:', error);
    return errors.internal(c, 'Failed to create task');
  }
});

// GET /api/v1/tasks/my - List user's tasks across all projects
tasks.get('/my', async (c) => {
  try {
    const user = c.get('user');
    const myTasks = await taskService.getMyTasks(user.id, user);
    return success(c, myTasks);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching my tasks:', error);
    return errors.internal(c, 'Failed to fetch tasks');
  }
});

// GET /api/v1/tasks/:id - Get task
tasks.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');

    const task = await taskService.getTask(taskId, user);

    if (!task) {
      return errors.notFound(c, 'Task not found');
    }

    return success(c, task);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching task:', error);
    return errors.internal(c, 'Failed to fetch task');
  }
});

// PATCH /api/v1/tasks/:id - Update task
tasks.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateTaskSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const task = await taskService.updateTask(taskId, validation.data, user);

    if (!task) {
      return errors.notFound(c, 'Task not found');
    }

    return success(c, task);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating task:', error);
    return errors.internal(c, 'Failed to update task');
  }
});

// DELETE /api/v1/tasks/:id - Delete task
tasks.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');

    const deleted = await taskService.deleteTask(taskId, user);

    if (!deleted) {
      return errors.notFound(c, 'Task not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting task:', error);
    return errors.internal(c, 'Failed to delete task');
  }
});

// PATCH /api/v1/tasks/:id/status - Update task status (kanban move)
tasks.patch('/:id/status', async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateTaskStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const task = await taskService.updateTaskStatus(taskId, validation.data.statusId, user);

    if (!task) {
      return errors.notFound(c, 'Task not found');
    }

    return success(c, task);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating task status:', error);
    return errors.internal(c, 'Failed to update task status');
  }
});

// PATCH /api/v1/tasks/:id/order - Update task sort order
tasks.patch('/:id/order', async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateTaskOrderSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const task = await taskService.updateTaskOrder(taskId, validation.data.sortOrder, user);

    if (!task) {
      return errors.notFound(c, 'Task not found');
    }

    return success(c, task);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating task order:', error);
    return errors.internal(c, 'Failed to update task order');
  }
});

// PATCH /api/v1/tasks/:id/assignees - Update task assignees
tasks.patch('/:id/assignees', async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateTaskAssigneesSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const task = await taskService.updateTaskAssignees(taskId, validation.data.assigneeIds, user);

    if (!task) {
      return errors.notFound(c, 'Task not found');
    }

    return success(c, task);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating task assignees:', error);
    return errors.internal(c, 'Failed to update task assignees');
  }
});

export { tasks };
