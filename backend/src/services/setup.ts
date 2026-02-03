import { UserRole } from '../db/schema';
import { userRepository, settingsRepository } from '../repositories';
import { authService } from './auth';

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
    await authService.register({
      email: input.adminEmail,
      password: input.adminPassword,
      name: input.adminName,
      role: UserRole.ADMIN,
    });

    // Set workspace settings
    await settingsRepository.set('workspace_name', input.workspaceName);
    await settingsRepository.set('setup_completed', true);
    await settingsRepository.set('allow_registration', false);
    await settingsRepository.set('session_duration_hours', 24);
  }
}

export const setupService = new SetupService();
