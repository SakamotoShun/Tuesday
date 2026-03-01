import nodemailer from 'nodemailer';
import { settingsRepository } from '../repositories';

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface PasswordResetEmailInput {
  to: string;
  name: string;
  resetUrl: string;
  workspaceName: string;
}

interface PasswordChangedEmailInput {
  to: string;
  name: string;
  workspaceName: string;
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function parsePort(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }

  return 587;
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }

  return defaultValue;
}

export class EmailService {
  private async getSmtpSettings(): Promise<SmtpSettings> {
    const [host, port, user, pass, from, secure] = await Promise.all([
      settingsRepository.get<string>('smtp_host'),
      settingsRepository.get<number | string>('smtp_port'),
      settingsRepository.get<string>('smtp_user'),
      settingsRepository.get<string>('smtp_pass'),
      settingsRepository.get<string>('smtp_from'),
      settingsRepository.get<boolean | string>('smtp_secure'),
    ]);

    return {
      host: normalizeString(host),
      port: parsePort(port),
      user: normalizeString(user),
      pass: normalizeString(pass),
      from: normalizeString(from),
      secure: parseBoolean(secure, false),
    };
  }

  private async createTransporter() {
    const smtp = await this.getSmtpSettings();

    if (!this.isConfigured(smtp)) {
      return null;
    }

    const auth = smtp.user.length > 0
      ? {
          user: smtp.user,
          pass: smtp.pass,
        }
      : undefined;

    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth,
    });
  }

  private isConfigured(smtp: SmtpSettings): boolean {
    return smtp.host.length > 0 && smtp.from.length > 0;
  }

  async hasConfiguration(): Promise<boolean> {
    const smtp = await this.getSmtpSettings();
    return this.isConfigured(smtp);
  }

  async verifyConnection(): Promise<void> {
    const transporter = await this.createTransporter();

    if (!transporter) {
      throw new Error('SMTP is not configured');
    }

    await transporter.verify();
  }

  async sendEmail(input: SendEmailInput): Promise<boolean> {
    const smtp = await this.getSmtpSettings();
    if (!this.isConfigured(smtp)) {
      console.warn('Email skipped: SMTP not configured');
      return false;
    }

    try {
      const transporter = await this.createTransporter();
      if (!transporter) {
        return false;
      }

      await transporter.sendMail({
        from: smtp.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<boolean> {
    const subject = `${input.workspaceName}: Reset your password`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 16px;">Reset your password</h2>
        <p style="margin: 0 0 12px;">Hi ${input.name},</p>
        <p style="margin: 0 0 12px;">We received a request to reset your password for ${input.workspaceName}.</p>
        <p style="margin: 0 0 20px;">
          <a href="${input.resetUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 10px 14px; text-decoration: none; border-radius: 6px;">Reset password</a>
        </p>
        <p style="margin: 0 0 12px;">This link expires in 1 hour and can only be used once.</p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `.trim();
    const text = [
      `Hi ${input.name},`,
      '',
      `We received a request to reset your password for ${input.workspaceName}.`,
      `Use this link to reset it: ${input.resetUrl}`,
      '',
      'This link expires in 1 hour and can only be used once.',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n');

    return this.sendEmail({
      to: input.to,
      subject,
      html,
      text,
    });
  }

  async sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<boolean> {
    const subject = `${input.workspaceName}: Password changed`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 16px;">Password changed</h2>
        <p style="margin: 0 0 12px;">Hi ${input.name},</p>
        <p style="margin: 0 0 12px;">Your password for ${input.workspaceName} has been updated.</p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">If this was not you, contact your administrator immediately.</p>
      </div>
    `.trim();
    const text = [
      `Hi ${input.name},`,
      '',
      `Your password for ${input.workspaceName} has been updated.`,
      'If this was not you, contact your administrator immediately.',
    ].join('\n');

    return this.sendEmail({
      to: input.to,
      subject,
      html,
      text,
    });
  }

  async sendTestEmail(to: string, workspaceName: string): Promise<boolean> {
    const subject = `${workspaceName}: SMTP test email`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 16px;">SMTP test successful</h2>
        <p style="margin: 0 0 12px;">This email confirms that SMTP is configured correctly for ${workspaceName}.</p>
      </div>
    `.trim();

    return this.sendEmail({
      to,
      subject,
      html,
      text: `This email confirms that SMTP is configured correctly for ${workspaceName}.`,
    });
  }
}

export const emailService = new EmailService();
