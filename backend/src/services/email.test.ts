import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import nodemailer from 'nodemailer';
import { config } from '../config';
import { settingsRepository } from '../repositories/settings';
import { EmailService } from './email';

const originalConfig = { ...config };
const spies: Array<{ mockRestore(): void }> = [];
let settings: Record<string, unknown>;
const sendMail = mock(async (_input: unknown) => ({ accepted: ['user@example.com'] }));
const service = new EmailService();
const notification = {
  to: 'user@example.com',
  recipientName: 'User',
  notificationTitle: 'Assigned to task: Example',
  relativeLink: '/projects/project-1/tasks?task=task-1',
  workspaceName: 'Tuesday',
  messageId: '<notification-1@tuesday.local>',
};

beforeEach(() => {
  config.nodeEnv = 'production';
  config.publicBaseUrl = 'https://tuesday.example';
  settings = {
    smtp_host: 'smtp.example.com', smtp_port: 587,
    smtp_user: 'mailer', smtp_pass: ' password with spaces ',
    smtp_from: 'Tuesday <notifications@example.com>', smtp_secure: false,
  };
  sendMail.mockClear();
  spies.push(spyOn(settingsRepository, 'get').mockImplementation(async <T>(key: string) =>
    (settings[key] ?? null) as T | null));
  spies.push(spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>));
});

afterEach(() => {
  for (const spy of spies.splice(0).reverse()) spy.mockRestore();
  Object.assign(config, originalConfig);
});

describe('EmailService', () => {
  it('requires verified STARTTLS and preserves SMTP password whitespace', async () => {
    expect(await service.sendNotificationEmail(notification)).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      auth: { user: 'mailer', pass: ' password with spaces ' },
      connectionTimeout: config.smtpConnectionTimeoutMs,
      greetingTimeout: config.smtpGreetingTimeoutMs,
      socketTimeout: config.smtpSocketTimeoutMs,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ messageId: notification.messageId }));
  });

  it('does not send with incomplete SMTP credentials', async () => {
    delete settings.smtp_pass;
    expect(await service.sendNotificationEmail(notification)).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not use the CORS origin for production notification links', async () => {
    config.publicBaseUrl = undefined;
    config.corsOrigin = 'https://unrelated.example';
    expect(await service.sendNotificationEmail(notification)).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('escapes notification content and links without changing plain text', async () => {
    await service.sendNotificationEmail({
      ...notification,
      recipientName: '<b>User</b>',
      notificationTitle: '<img src=x> & task',
      workspaceName: '<i>Tuesday</i>',
      relativeLink: '/notifications?one=1&two=2',
    });
    const message = sendMail.mock.calls[0][0] as { html: string; text: string };
    expect(message.html).toContain('&lt;b&gt;User&lt;/b&gt;');
    expect(message.html).toContain('&lt;img src=x&gt; &amp; task');
    expect(message.html).toContain('Open &lt;i&gt;Tuesday&lt;/i&gt;');
    expect(message.html).toContain('href="https://tuesday.example/notifications?one=1&amp;two=2"');
    expect(message.text).toContain('<img src=x> & task');
  });

  it('escapes the workspace name in SMTP test emails', async () => {
    await service.sendTestEmail('user@example.com', '<img src=x onerror=alert(1)>');
    const message = sendMail.mock.calls[0][0] as { html: string };
    expect(message.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(message.html).not.toContain('<img');
  });

  it('keeps notification links on the configured site', async () => {
    settings.site_url = 'https://legacy.example';
    await service.sendNotificationEmail({ ...notification, relativeLink: 'https://attacker.example' });
    const message = sendMail.mock.calls[0][0] as { html: string };
    expect(message.html).toContain('href="https://tuesday.example/notifications"');
    expect(message.html).not.toContain('attacker.example');
    expect(message.html).not.toContain('legacy.example');
  });
});
