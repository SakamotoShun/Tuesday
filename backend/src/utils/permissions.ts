import { UserRole } from '../db/schema';
import type { User } from '../types';

export function isFreelancer(user: Pick<User, 'role'>): boolean {
  return user.role === UserRole.FREELANCER;
}

export function assertNotFreelancer(user: Pick<User, 'role'>, message: string): void {
  if (isFreelancer(user)) {
    throw new Error(message);
  }
}
