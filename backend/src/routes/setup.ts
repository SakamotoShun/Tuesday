import { Hono } from 'hono';
import { setupService } from '../services/setup';
import { setupSchema, formatValidationErrors } from '../utils/validation';
import { success, errors } from '../utils/response';
import { setupRateLimit } from '../middleware';

const setupRouter = new Hono();

/**
 * GET /api/v1/setup/status
 * Check if setup has been completed
 */
setupRouter.get('/status', async (c) => {
  const initialized = await setupService.isInitialized();
  return success(c, { initialized });
});

/**
 * POST /api/v1/setup/complete
 * Complete first-time setup
 * Rate limited to 10 requests per minute
 */
setupRouter.post('/complete', setupRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate input
    const validation = setupSchema.safeParse(body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.error));
    }

    // Complete setup
    await setupService.completeSetup(validation.data);

    return success(c, { message: 'Setup completed successfully' });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Setup has already been completed') {
        return errors.forbidden(c, error.message);
      }
      if (error.message === 'User with this email already exists') {
        return errors.conflict(c, 'Admin user already exists');
      }
    }
    throw error;
  }
});

export { setupRouter };
