import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { UserRepository, userRepository } from '../repositories';
import { authService } from '../services';
import { hashPassword } from '../utils/password';
import { profile } from './profile';

const authenticatedUser = {
  id: 'user-1',
  email: 'current@example.com',
  name: 'Current User',
  avatarUrl: null,
  role: 'member' as const,
  employmentType: 'full_time' as const,
  hourlyRate: null,
  isDisabled: false,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const originalValidateSession = authService.validateSession;
const realFindById = UserRepository.prototype.findById.bind(userRepository);
const realFindByEmail = UserRepository.prototype.findByEmail.bind(userRepository);
const realUpdate = UserRepository.prototype.update.bind(userRepository);

function createApp() {
  const app = new Hono();
  app.route('/api/v1/profile', profile);
  return app;
}

describe('Profile Routes', () => {
  beforeEach(async () => {
    const passwordHash = await hashPassword('password-123');

    authService.validateSession = async () => authenticatedUser;
    userRepository.findById = async () => ({
      ...authenticatedUser,
      passwordHash,
    } as any);
    userRepository.findByEmail = async () => null;
    userRepository.update = async () => ({
      ...authenticatedUser,
    } as any);
  });

  afterEach(() => {
    authService.validateSession = originalValidateSession;
    userRepository.findById = realFindById;
    userRepository.findByEmail = realFindByEmail;
    userRepository.update = realUpdate;
  });

  it('returns conflict when email update hits a duplicate at write time', async () => {
    userRepository.update = async () => {
      throw new Error('User with this email already exists');
    };

    const response = await createApp().request('/api/v1/profile/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session_id=test-session',
      },
      body: JSON.stringify({
        currentPassword: 'password-123',
        newEmail: 'duplicate@example.com',
      }),
    });

    expect(response.status).toBe(409);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('User with this email already exists');
  });
});
