import { Hono } from 'hono';
import { auth } from '../middleware';
import { chatService } from '../services';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createDMSchema } from '../utils/validation';

const dms = new Hono();

dms.use('*', auth);

// GET /api/v1/dms - List direct message channels
dms.get('/', async (c) => {
  try {
    const user = c.get('user');
    const channels = await chatService.getDMChannels(user);
    return success(c, channels);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching DMs:', error);
    return errors.internal(c, 'Failed to fetch DMs');
  }
});

// POST /api/v1/dms - Create or open a DM
dms.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createDMSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const channel = await chatService.getOrCreateDM(validation.data.userId, user);
    return success(c, channel, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating DM:', error);
    return errors.internal(c, 'Failed to create DM');
  }
});

export { dms };
