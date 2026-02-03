import { Hono } from 'hono';
import { authService } from '../services/auth';
import { settingsRepository } from '../repositories';
import { loginSchema, registerSchema, formatValidationErrors } from '../utils/validation';
import { success, errors } from '../utils/response';
import { auth, authRateLimit } from '../middleware';
import { config } from '../config';

const authRouter = new Hono();

/**
 * POST /api/v1/auth/register
 * Register a new user (only if registration is enabled)
 */
authRouter.post('/register', authRateLimit, async (c) => {
  try {
    // Check if registration is enabled
    const allowRegistration = await settingsRepository.get<boolean>('allow_registration');
    if (!allowRegistration) {
      return errors.forbidden(c, 'Registration is disabled');
    }

    const body = await c.req.json();

    // Validate input
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.error));
    }

    // Register user
    const user = await authService.register(validation.data);

    return success(c, { user }, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'User with this email already exists') {
        return errors.conflict(c, error.message);
      }
    }
    throw error;
  }
});

/**
 * POST /api/v1/auth/login
 * Login with email and password
 */
authRouter.post('/login', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.error));
    }

    // Get client info
    const ip = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP');
    const userAgent = c.req.header('User-Agent');

    // Login
    const result = await authService.login({
      ...validation.data,
      ip: ip || undefined,
      userAgent: userAgent || undefined,
    });

    // Set session cookie
    c.header('Set-Cookie', `session_id=${result.sessionId}; HttpOnly; Path=/; Max-Age=${config.sessionDurationHours * 3600}; SameSite=Strict${config.nodeEnv === 'production' ? '; Secure' : ''}`);

    return success(c, { user: result.user });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid credentials' || error.message === 'Account has been disabled') {
        return errors.unauthorized(c, 'Invalid credentials');
      }
    }
    throw error;
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout current user
 */
authRouter.post('/logout', auth, async (c) => {
  const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];

  if (sessionId) {
    await authService.logout(sessionId);
  }

  // Clear session cookie
  c.header('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');

  return success(c, { message: 'Logged out successfully' });
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user
 */
authRouter.get('/me', auth, (c) => {
  const user = c.get('user');
  return success(c, { user });
});

export { authRouter };
