import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { hashPassword } from '../utils/password';

let findByEmail: (email: string) => Promise<any> = async () => null;
let createUser: (data: any) => Promise<any> = async (data) => ({
  id: 'user-1',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...data,
});
let sessionCreate: (data: any) => Promise<void> = async () => {};
let sessionDelete: (id: string) => Promise<boolean> = async () => true;
let sessionFind: (id: string) => Promise<any> = async () => null;

mock.module('../repositories/user', () => ({
  UserRepository: class {},
  userRepository: {
    findByEmail: (email: string) => findByEmail(email),
    create: (data: any) => createUser(data),
  },
}));

mock.module('../repositories/session', () => ({
  SessionRepository: class {},
  sessionRepository: {
    create: (data: any) => sessionCreate(data),
    delete: (id: string) => sessionDelete(id),
    findByIdWithUser: (id: string) => sessionFind(id),
  },
}));

const { authService } = await import('./auth');

describe('AuthService', () => {
  beforeEach(() => {
    findByEmail = async () => null;
    createUser = async (data) => ({
      id: 'user-1',
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    });
    sessionCreate = async () => {};
    sessionDelete = async () => true;
    sessionFind = async () => null;
  });

  it('registers a new user with hashed password', async () => {
    let createdInput: any;
    createUser = async (data) => {
      createdInput = data;
      return {
        id: 'user-1',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
    };

    const user = await authService.register({
      email: 'test@example.com',
      password: 'password-123',
      name: 'Test User',
    });

    expect(createdInput.passwordHash).not.toBe('password-123');
    expect(createdInput.passwordHash.startsWith('$2')).toBe(true);
    expect(user.email).toBe('test@example.com');
    expect('passwordHash' in user).toBe(false);
  });

  it('rejects duplicate registration', async () => {
    findByEmail = async () => ({ id: 'user-1' });
    await expect(
      authService.register({
        email: 'test@example.com',
        password: 'password-123',
        name: 'Test User',
      })
    ).rejects.toThrow('User with this email already exists');
  });

  it('rejects login for unknown user', async () => {
    findByEmail = async () => null;
    await expect(
      authService.login({ email: 'missing@example.com', password: 'pw' })
    ).rejects.toThrow('Invalid credentials');
  });

  it('rejects login for disabled user', async () => {
    const passwordHash = await hashPassword('pw');
    findByEmail = async () => ({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash,
      name: 'Test User',
      role: 'member',
      isDisabled: true,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      authService.login({ email: 'test@example.com', password: 'pw' })
    ).rejects.toThrow('Account has been disabled');
  });

  it('rejects login for invalid password', async () => {
    const passwordHash = await hashPassword('correct-password');
    findByEmail = async () => ({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash,
      name: 'Test User',
      role: 'member',
      isDisabled: false,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(
      authService.login({ email: 'test@example.com', password: 'wrong-password' })
    ).rejects.toThrow('Invalid credentials');
  });

  it('creates a session on login', async () => {
    let createdSession: any;
    const passwordHash = await hashPassword('pw');
    findByEmail = async () => ({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash,
      name: 'Test User',
      role: 'member',
      isDisabled: false,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    sessionCreate = async (data) => {
      createdSession = data;
    };

    const result = await authService.login({
      email: 'test@example.com',
      password: 'pw',
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    expect(result.sessionId.length).toBe(64);
    expect(createdSession.userId).toBe('user-1');
    expect(createdSession.ip).toBe('127.0.0.1');
    expect(createdSession.userAgent).toBe('test-agent');
  });

  it('logs out by deleting session', async () => {
    let deletedId = '';
    sessionDelete = async (id) => {
      deletedId = id;
      return true;
    };
    const ok = await authService.logout('session-1');
    expect(ok).toBe(true);
    expect(deletedId).toBe('session-1');
  });

  it('returns null for missing session', async () => {
    sessionFind = async () => null;
    const user = await authService.validateSession('missing');
    expect(user).toBeNull();
  });

  it('cleans up expired sessions', async () => {
    let deleted = false;
    sessionFind = async () => ({
      session: { id: 'session-1', expiresAt: new Date(Date.now() - 1000) },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        isDisabled: false,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: 'hash',
      },
    });
    sessionDelete = async () => {
      deleted = true;
      return true;
    };

    const user = await authService.validateSession('session-1');
    expect(user).toBeNull();
    expect(deleted).toBe(true);
  });

  it('cleans up sessions for disabled users', async () => {
    let deleted = false;
    sessionFind = async () => ({
      session: { id: 'session-1', expiresAt: new Date(Date.now() + 1000) },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        isDisabled: true,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: 'hash',
      },
    });
    sessionDelete = async () => {
      deleted = true;
      return true;
    };

    const user = await authService.validateSession('session-1');
    expect(user).toBeNull();
    expect(deleted).toBe(true);
  });

  it('returns user for valid session', async () => {
    sessionFind = async () => ({
      session: { id: 'session-1', expiresAt: new Date(Date.now() + 1000) },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        isDisabled: false,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: 'hash',
      },
    });

    const user = await authService.validateSession('session-1');
    expect(user?.email).toBe('test@example.com');
    expect(user && 'passwordHash' in user).toBe(false);
  });
});
