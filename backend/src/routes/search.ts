import { Hono } from 'hono';
import { z } from 'zod';
import { auth } from '../middleware';
import { searchService } from '../services';
import { success, errors } from '../utils/response';
import { formatValidationErrors } from '../utils/validation';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(200, 'Search query is too long'),
  limit: z.preprocess(
    (value) => (value === undefined ? 6 : Number(value)),
    z.number().int().min(1, 'Limit must be at least 1').max(20, 'Limit cannot exceed 20')
  ),
});

const search = new Hono();

search.use('*', auth);

// GET /api/v1/search - Global search across projects, docs, and tasks
search.get('/', async (c) => {
  try {
    const queryValidation = searchQuerySchema.safeParse(c.req.query());
    if (!queryValidation.success) {
      return errors.validation(c, formatValidationErrors(queryValidation.error));
    }

    const user = c.get('user');
    const results = await searchService.search(user, queryValidation.data.q, queryValidation.data.limit);
    return success(c, results);
  } catch (error) {
    console.error('Error performing search:', error);
    return errors.internal(c, 'Failed to perform search');
  }
});

export { search };
