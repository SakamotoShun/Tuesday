import { Hono } from 'hono';
import { docService } from '../services';
import { errors, success } from '../utils/response';

const shared = new Hono();

// GET /api/v1/shared/docs/:token - View-only shared doc
shared.get('/docs/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const sharedDoc = await docService.getSharedDocByToken(token);

    if (!sharedDoc) {
      return errors.notFound(c, 'Shared doc');
    }

    return success(c, sharedDoc);
  } catch (error) {
    console.error('Error fetching shared doc:', error);
    return errors.internal(c, 'Failed to fetch shared doc');
  }
});

export { shared };
