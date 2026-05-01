import { describe, it, expect, beforeEach, mock } from 'bun:test';

let countUsers: () => Promise<number> = async () => 0;
let setSetting: (key: string, value: unknown) => Promise<void> = async () => {};
let registerUser: (input: any) => Promise<any> = async () => ({ id: 'admin-1' });

mock.module('../repositories/user', () => {
  class MockUserRepository {
    findById() {
      return Promise.resolve(null);
    }

    findByEmail() {
      return Promise.resolve(null);
    }

    create(data: any) {
      return Promise.resolve({ id: 'user-1', ...data });
    }

    update(id: string, data: any) {
      return Promise.resolve({ id, ...data });
    }

    count() {
      return countUsers();
    }

    findAll() {
      return Promise.resolve([]);
    }
  }

  return {
    UserRepository: MockUserRepository,
    userRepository: new MockUserRepository(),
  };
});

mock.module('../repositories/settings', () => ({
  SettingsRepository: class {},
  settingsRepository: {
    set: (key: string, value: unknown) => setSetting(key, value),
  },
}));

const { setupService, setRegisterAdminUserForTests } = await import('./setup');

describe('SetupService', () => {
  beforeEach(() => {
    countUsers = async () => 0;
    setSetting = async () => {};
    registerUser = async () => ({ id: 'admin-1' });
    setRegisterAdminUserForTests((input) => registerUser(input));
  });

  it('returns false when no users exist', async () => {
    countUsers = async () => 0;
    const initialized = await setupService.isInitialized();
    expect(initialized).toBe(false);
  });

  it('returns true when users exist', async () => {
    countUsers = async () => 3;
    const initialized = await setupService.isInitialized();
    expect(initialized).toBe(true);
  });

  it('throws if setup already completed', async () => {
    countUsers = async () => 1;
    await expect(
      setupService.completeSetup({
        workspaceName: 'Tuesday',
        adminEmail: 'admin@example.com',
        adminName: 'Admin',
        adminPassword: 'password-123',
      })
    ).rejects.toThrow('Setup has already been completed');
  });

  it('registers admin user and sets workspace settings', async () => {
    const settings: Array<{ key: string; value: unknown }> = [];
    setSetting = async (key, value) => {
      settings.push({ key, value });
    };

    let registeredInput: any;
    registerUser = async (input) => {
      registeredInput = input;
      return { id: 'admin-1' };
    };

    await setupService.completeSetup({
      workspaceName: 'Tuesday',
      adminEmail: 'admin@example.com',
      adminName: 'Admin',
      adminPassword: 'password-123',
    });

    expect(registeredInput.role).toBe('admin');
    expect(settings).toEqual([
      { key: 'workspace_name', value: 'Tuesday' },
      { key: 'setup_completed', value: true },
      { key: 'allow_registration', value: true },
      { key: 'session_duration_hours', value: 24 },
    ]);
  });
});
