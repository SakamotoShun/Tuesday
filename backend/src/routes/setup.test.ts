import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config';
import { setupService } from '../services/setup';
import { setupRouter } from './setup';

const originalCompleteSetup = setupService.completeSetup;
const originalRateLimitEnabled = config.rateLimitEnabled;

function createApp() {
  const app = new Hono();
  app.route('/api/v1/setup', setupRouter);
  return app;
}

describe('Setup Routes', () => {
  beforeEach(() => {
    config.rateLimitEnabled = false;
    setupService.completeSetup = async () => {};
  });

  afterEach(() => {
    config.rateLimitEnabled = originalRateLimitEnabled;
    setupService.completeSetup = originalCompleteSetup;
  });

  it('returns conflict when setup hits a duplicate admin email at write time', async () => {
    setupService.completeSetup = async () => {
      throw new Error('User with this email already exists');
    };

    const response = await createApp().request('/api/v1/setup/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceName: 'Tuesday',
        adminEmail: 'admin@example.com',
        adminName: 'Admin User',
        adminPassword: 'password-123',
      }),
    });

    expect(response.status).toBe(409);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('Admin user already exists');
  });
});
