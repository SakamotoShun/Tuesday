import { createHash, randomBytes } from 'crypto';
import { TokenType, UserRole } from '../db/schema';
import { sessionRepository, settingsRepository, tokenRepository, userRepository } from '../repositories';
import { hashPassword, verifyPassword } from '../utils/password';
import { config } from '../config';
import { emailService } from './email';
import type { User } from '../types';

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT_MAX = 5;

interface PasswordResetRateEntry {
  count: number;
  resetAt: number;
}

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
  private passwordResetRateLimits = new Map<string, PasswordResetRateEntry>();

  /**
   * Generate a cryptographically secure session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  private generatePasswordResetToken(): string {
    return randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getWorkspaceName(value: string | null): string {
    return value?.trim() || 'Tuesday';
  }

  private getPublicSiteUrl(value: string | null): string {
    const candidate = value?.trim() || config.corsOrigin;
    return candidate.replace(/\/+$/, '');
  }

  private isPasswordResetRateLimited(email: string): boolean {
    const key = email.trim().toLowerCase();
    const now = Date.now();
    const entry = this.passwordResetRateLimits.get(key);

    if (!entry || now > entry.resetAt) {
      this.passwordResetRateLimits.set(key, {
        count: 1,
        resetAt: now + PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
      });
      return false;
    }

    entry.count += 1;
    return entry.count > PASSWORD_RESET_RATE_LIMIT_MAX;
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
      onboardingCompletedAt: user.onboardingCompletedAt,
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
        onboardingCompletedAt: user.onboardingCompletedAt,
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
      onboardingCompletedAt: result.user.onboardingCompletedAt,
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

  async requestPasswordReset(email: string): Promise<void> {
    if (this.isPasswordResetRateLimited(email)) {
      throw new Error('Too many password reset requests');
    }

    const normalizedEmail = email.trim();
    const user = await userRepository.findByEmail(normalizedEmail);
    if (!user || user.isDisabled) {
      return;
    }

    const token = this.generatePasswordResetToken();
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await tokenRepository.deleteByUserAndType(user.id, TokenType.PASSWORD_RESET);
    await tokenRepository.create({
      userId: user.id,
      tokenHash,
      type: TokenType.PASSWORD_RESET,
      expiresAt,
      extra: {},
    });

    const [workspaceNameSetting, siteUrlSetting] = await Promise.all([
      settingsRepository.get<string>('workspace_name'),
      settingsRepository.get<string>('site_url'),
    ]);

    const workspaceName = this.getWorkspaceName(workspaceNameSetting);
    const siteUrl = this.getPublicSiteUrl(siteUrlSetting);
    const resetUrl = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;

    void emailService.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      workspaceName,
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = this.hashResetToken(token);
    const resetToken = await tokenRepository.findActiveByTokenHash(tokenHash, TokenType.PASSWORD_RESET);
    if (!resetToken) {
      throw new Error('Invalid or expired reset token');
    }

    const markedUsed = await tokenRepository.markUsed(resetToken.id);
    if (!markedUsed) {
      throw new Error('Invalid or expired reset token');
    }

    const user = await userRepository.findById(resetToken.userId);
    if (!user || user.isDisabled) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(password);
    await userRepository.update(user.id, { passwordHash });
    await sessionRepository.deleteByUserId(user.id);

    const workspaceName = this.getWorkspaceName(await settingsRepository.get<string>('workspace_name'));
    void emailService.sendPasswordChangedEmail({
      to: user.email,
      name: user.name,
      workspaceName,
    });
  }

  async cleanupExpiredTokens(): Promise<number> {
    return tokenRepository.deleteExpiredOrUsed();
  }
}

export const authService = new AuthService();
