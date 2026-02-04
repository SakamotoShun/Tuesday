import { Hono } from 'hono';
import { projectStatusRepository, taskStatusRepository } from '../repositories';
import { auth } from '../middleware';
import { success, errors } from '../utils/response';

const statuses = new Hono();

// All status list routes require authentication
statuses.use('*', auth);

// GET /api/v1/statuses/project - List project statuses
statuses.get('/project', async (c) => {
  try {
    const list = await projectStatusRepository.findAll();
    return success(c, list);
  } catch (error) {
    console.error('Error fetching project statuses:', error);
    return errors.internal(c, 'Failed to fetch project statuses');
  }
});

// GET /api/v1/statuses/task - List task statuses
statuses.get('/task', async (c) => {
  try {
    const list = await taskStatusRepository.findAll();
    return success(c, list);
  } catch (error) {
    console.error('Error fetching task statuses:', error);
    return errors.internal(c, 'Failed to fetch task statuses');
  }
});

export { statuses };
