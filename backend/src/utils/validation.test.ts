import { describe, it, expect } from 'bun:test';
import {
  emailSchema,
  passwordSchema,
  loginSchema,
  registerSchema,
  setupSchema,
  createProjectSchema,
  createTaskSchema,
  createMessageSchema,
  updateTaskOrderSchema,
  createChannelSchema,
} from './validation';

describe('validation schemas', () => {
  it('validates email schema', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('validates password schema length', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('long-enough-password').success).toBe(true);
  });

  it('validates login schema', () => {
    const ok = loginSchema.safeParse({ email: 'user@example.com', password: 'pw' });
    const bad = loginSchema.safeParse({ email: '', password: '' });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates register schema', () => {
    const ok = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'password-123',
      name: 'Test User',
    });
    const bad = registerSchema.safeParse({
      email: 'bad',
      password: 'short',
      name: '',
    });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates setup schema', () => {
    const ok = setupSchema.safeParse({
      workspaceName: 'Tuesday',
      adminEmail: 'admin@example.com',
      adminName: 'Admin',
      adminPassword: 'password-123',
    });
    const bad = setupSchema.safeParse({
      workspaceName: '',
      adminEmail: 'nope',
      adminName: '',
      adminPassword: 'short',
    });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates createProject schema', () => {
    const ok = createProjectSchema.safeParse({ name: 'Project A' });
    const bad = createProjectSchema.safeParse({ name: '' });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates createTask schema', () => {
    const ok = createTaskSchema.safeParse({ title: 'Task A' });
    const bad = createTaskSchema.safeParse({ title: '' });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates createMessage schema (content or attachment required)', () => {
    const okContent = createMessageSchema.safeParse({ content: 'Hello' });
    const okAttachment = createMessageSchema.safeParse({ attachmentIds: ['123e4567-e89b-12d3-a456-426614174000'] });
    const bad = createMessageSchema.safeParse({ content: '   ', attachmentIds: [] });
    expect(okContent.success).toBe(true);
    expect(okAttachment.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates updateTaskOrder schema', () => {
    const ok = updateTaskOrderSchema.safeParse({ sortOrder: 0 });
    const bad = updateTaskOrderSchema.safeParse({ sortOrder: -1 });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates createChannel schema', () => {
    const ok = createChannelSchema.safeParse({ name: 'general' });
    const bad = createChannelSchema.safeParse({ name: '' });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });
});
