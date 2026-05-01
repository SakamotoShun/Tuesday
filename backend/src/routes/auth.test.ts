import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config';
import { settingsRepository } from '../repositories';
import { authService } from '../services/auth';
import { authRouter } from './auth';

const originalRegister = authService.register;
const originalGetSetting = settingsRepository.get;
const originalRateLimitEnabled = config.rateLimitEnabled;

function createApp() {
  const app = new Hono();
  app.route('/api/v1/auth', authRouter);
  return app;
}

describe('Auth Routes', () => {
  beforeEach(() => {
    config.rateLimitEnabled = false;
    settingsRepository.get = async <T>() => true as T;
    authService.register = async (input) => ({
      id: 'user-1',
      email: input.email,
      name: input.name,
      avatarUrl: null,
      role: 'member',
      employmentType: 'full_time',
      hourlyRate: null,
      isDisabled: false,
      onboardingCompletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    config.rateLimitEnabled = originalRateLimitEnabled;
    settingsRepository.get = originalGetSetting;
    authService.register = originalRegister;
  });

  it('returns conflict when registration hits a duplicate email at write time', async () => {
    authService.register = async () => {
      throw new Error('User with this email already exists');
    };

    const response = await createApp().request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'duplicate@example.com',
        password: 'password-123',
        name: 'Duplicate User',
      }),
    });

    expect(response.status).toBe(409);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('User with this email already exists');
  });
});
