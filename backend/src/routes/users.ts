import { Hono } from 'hono';
import { auth } from '../middleware';
import { userRepository } from '../repositories';
import { success, errors } from '../utils/response';

const users = new Hono();

users.use('*', auth);

// GET /api/v1/users/mentionable - List users available for mentions
users.get('/mentionable', async (c) => {
  try {
    const list = await userRepository.findAll();
    return success(c, list);
  } catch (error) {
    console.error('Error fetching mentionable users:', error);
    return errors.internal(c, 'Failed to fetch users');
  }
});

export { users };
