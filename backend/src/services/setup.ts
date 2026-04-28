import { UserRole } from '../db/schema';
import { userRepository } from '../repositories/user';
import { settingsRepository } from '../repositories/settings';

type RegisterAdminUser = (input: {
  email: string;
  password: string;
  name: string;
  role: typeof UserRole.ADMIN;
}) => Promise<unknown>;

const defaultRegisterAdminUser: RegisterAdminUser = async (input) => {
  const { authService } = await import('./auth');
  return authService.register(input);
};

let registerAdminUser: RegisterAdminUser = defaultRegisterAdminUser;

export function setRegisterAdminUserForTests(register: RegisterAdminUser | null): void {
  registerAdminUser = register ?? defaultRegisterAdminUser;
}

export interface SetupInput {
  workspaceName: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

export class SetupService {
  /**
   * Check if setup has been completed
   */
  async isInitialized(): Promise<boolean> {
    // Check if any users exist
    const userCount = await userRepository.count();
    return userCount > 0;
  }

  /**
   * Complete the first-time setup
   * Creates admin user and sets workspace settings
   */
  async completeSetup(input: SetupInput): Promise<void> {
    // Check if already initialized
    const isInitialized = await this.isInitialized();
    if (isInitialized) {
      throw new Error('Setup has already been completed');
    }

    // Create admin user
    await registerAdminUser({
      email: input.adminEmail,
      password: input.adminPassword,
      name: input.adminName,
      role: UserRole.ADMIN,
    });

    // Set workspace settings
    await settingsRepository.set('workspace_name', input.workspaceName);
    await settingsRepository.set('setup_completed', true);
    await settingsRepository.set('allow_registration', true);
    await settingsRepository.set('session_duration_hours', 24);
  }
}

export const setupService = new SetupService();
