import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { userRepository } from '../repositories';
import { authService } from '../services';
import { admin } from './admin';

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin User',
  avatarUrl: null,
  role: 'admin' as const,
  employmentType: 'full_time' as const,
  hourlyRate: null,
  isDisabled: false,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const originalValidateSession = authService.validateSession;
const originalFindByEmail = userRepository.findByEmail;
const originalCreate = userRepository.create;

function createApp() {
  const app = new Hono();
  app.route('/api/v1/admin', admin);
  return app;
}

describe('Admin Routes', () => {
  beforeEach(() => {
    authService.validateSession = async () => adminUser;
    userRepository.findByEmail = async () => null;
    userRepository.create = async (data) => ({
      id: 'user-2',
      avatarUrl: null,
      hourlyRate: null,
      isDisabled: false,
      onboardingCompletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      employmentType: 'full_time',
      ...data,
    } as any);
  });

  afterEach(() => {
    authService.validateSession = originalValidateSession;
    userRepository.findByEmail = originalFindByEmail;
    userRepository.create = originalCreate;
  });

  it('returns conflict when user creation hits a duplicate email at write time', async () => {
    userRepository.create = async () => {
      throw new Error('User with this email already exists');
    };

    const response = await createApp().request('/api/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session_id=test-session',
      },
      body: JSON.stringify({
        email: 'duplicate@example.com',
        name: 'Duplicate User',
        role: 'member',
        employmentType: 'full_time',
      }),
    });

    expect(response.status).toBe(409);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('User already exists');
  });
});
