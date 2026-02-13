import { randomBytes } from 'crypto';
import { UserRole } from '../db/schema';
import { userRepository, sessionRepository } from '../repositories';
import { hashPassword, verifyPassword } from '../utils/password';
import { config } from '../config';
import type { User } from '../types';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role?: 'admin' | 'member';
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

export interface SessionResult {
  sessionId: string;
  user: User;
  expiresAt: Date;
}

export class AuthService {
  /**
   * Generate a cryptographically secure session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Calculate session expiration date
   */
  private getSessionExpiration(): Date {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.sessionDurationHours);
    return expiresAt;
  }

  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<User> {
    // Check if user already exists
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user
    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role || UserRole.MEMBER,
      isDisabled: false,
    });

    // Return user without password hash
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role as 'admin' | 'member',
      employmentType: user.employmentType as 'hourly' | 'full_time',
      hourlyRate: user.hourlyRate,
      isDisabled: user.isDisabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Login user and create session
   */
  async login(input: LoginInput): Promise<SessionResult> {
    // Find user by email
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if user is disabled
    if (user.isDisabled) {
      throw new Error('Account has been disabled');
    }

    // Verify password
    const isValidPassword = await verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Create session
    const sessionId = this.generateSessionId();
    const expiresAt = this.getSessionExpiration();

    await sessionRepository.create({
      id: sessionId,
      userId: user.id,
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    // Return session info and user
    return {
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role as 'admin' | 'member',
        employmentType: user.employmentType as 'hourly' | 'full_time',
        hourlyRate: user.hourlyRate,
        isDisabled: user.isDisabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      expiresAt,
    };
  }

  /**
   * Logout user by deleting session
   */
  async logout(sessionId: string): Promise<boolean> {
    return sessionRepository.delete(sessionId);
  }

  /**
   * Validate a session and return the user
   */
  async validateSession(sessionId: string): Promise<User | null> {
    const result = await sessionRepository.findByIdWithUser(sessionId);
    
    if (!result) {
      return null;
    }

    // Check if session is expired
    if (new Date() > result.session.expiresAt) {
      await sessionRepository.delete(sessionId);
      return null;
    }

    // Check if user is disabled
    if (result.user.isDisabled) {
      await sessionRepository.delete(sessionId);
      return null;
    }

    // Return user without password hash
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      avatarUrl: result.user.avatarUrl,
      role: result.user.role as 'admin' | 'member',
      employmentType: result.user.employmentType as 'hourly' | 'full_time',
      hourlyRate: result.user.hourlyRate,
      isDisabled: result.user.isDisabled,
      createdAt: result.user.createdAt,
      updatedAt: result.user.updatedAt,
    };
  }

  /**
   * Get current user from session
   */
  async getCurrentUser(sessionId: string): Promise<User | null> {
    return this.validateSession(sessionId);
  }
}

export const authService = new AuthService();
