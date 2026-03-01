import { Hono } from 'hono';
import { authService } from '../services/auth';
import { settingsRepository } from '../repositories';
import {
  forgotPasswordSchema,
  formatValidationErrors,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../utils/validation';
import { success, errors } from '../utils/response';
import { auth, authRateLimit } from '../middleware';
import { config } from '../config';
import type { User } from '../types';

const authRouter = new Hono();

const toPublicUser = (user: User) => {
  const hourlyRate = user.hourlyRate !== null && user.hourlyRate !== undefined
    ? Number(user.hourlyRate)
    : null;

  return {
    ...user,
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : null,
  };
};

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

    return success(c, { user: toPublicUser(user) }, undefined, 201);
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

    return success(c, { user: toPublicUser(result.user) });
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
 * POST /api/v1/auth/forgot-password
 * Request a password reset email
 */
authRouter.post('/forgot-password', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const validation = forgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.error));
    }

    await authService.requestPasswordReset(validation.data.email);

    return success(c, {
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Too many password reset requests') {
      return errors.tooManyRequests(c, 'Too many password reset requests. Please try again later.');
    }

    console.error('Forgot password request failed:', error);
    return success(c, {
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password with a valid token
 */
authRouter.post('/reset-password', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const validation = resetPasswordSchema.safeParse(body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.error));
    }

    await authService.resetPassword(validation.data.token, validation.data.password);

    return success(c, { reset: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid or expired reset token') {
      return errors.badRequest(c, 'Invalid or expired reset token');
    }

    console.error('Reset password request failed:', error);
    return errors.internal(c, 'Failed to reset password');
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
  return success(c, { user: toPublicUser(user) });
});

export { authRouter };
