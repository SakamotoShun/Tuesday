import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { db } from '../db/client';
import { runMigrations } from '../db/migrate';
import {
  docs,
  ProjectMemberRole,
  projects,
  projectMembers,
  sessions,
  tasks,
  taskAssignees,
  UserRole,
  users,
  type Doc,
  type Project,
  type Session,
  type Task,
  type User,
} from '../db/schema';
import { hashPassword } from '../utils/password';

let migrationPromise: Promise<void> | null = null;

export function createRouteTestApp(path: string, router: Hono) {
  const app = new Hono();
  app.route(path, router);
  return app;
}

export async function ensureIntegrationDb() {
  if (!migrationPromise) {
    migrationPromise = runMigrations();
  }

  await migrationPromise;
}

export function createSessionCookie(sessionId: string) {
  return `session_id=${sessionId}`;
}

export async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const passwordHash = overrides.passwordHash ?? await hashPassword('password-123');

  const [user] = await db.insert(users).values({
    id: overrides.id ?? randomUUID(),
    email: overrides.email ?? `user-${randomUUID()}@example.com`,
    passwordHash,
    name: overrides.name ?? 'Integration User',
    role: overrides.role ?? UserRole.MEMBER,
    employmentType: overrides.employmentType ?? 'full_time',
    hourlyRate: overrides.hourlyRate ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    isDisabled: overrides.isDisabled ?? false,
    onboardingCompletedAt: overrides.onboardingCompletedAt ?? null,
  }).returning();

  return user satisfies User;
}

export async function seedSession(userId: string, overrides: Partial<typeof sessions.$inferInsert> = {}) {
  const [session] = await db.insert(sessions).values({
    id: overrides.id ?? randomBytes(32).toString('hex'),
    userId,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    ip: overrides.ip ?? '127.0.0.1',
    userAgent: overrides.userAgent ?? 'integration-test',
  }).returning();

  return session satisfies Session;
}

export async function seedProject(ownerId: string, overrides: Partial<typeof projects.$inferInsert> = {}) {
  const [project] = await db.insert(projects).values({
    id: overrides.id ?? randomUUID(),
    name: overrides.name ?? `Project ${randomUUID().slice(0, 8)}`,
    ownerId,
    client: overrides.client ?? null,
    statusId: overrides.statusId ?? null,
    type: overrides.type ?? null,
    startDate: overrides.startDate ?? null,
    targetEndDate: overrides.targetEndDate ?? null,
    budgetHours: overrides.budgetHours ?? null,
    isTemplate: overrides.isTemplate ?? false,
  }).returning();

  return project satisfies Project;
}

export async function seedProjectMember(
  projectId: string,
  userId: string,
  role: 'owner' | 'member' = ProjectMemberRole.MEMBER
) {
  await db.insert(projectMembers).values({
    projectId,
    userId,
    role,
    source: 'direct',
    sourceTeamId: null,
  }).onConflictDoNothing();
}

export async function seedTask(projectId: string, createdBy: string, overrides: Partial<typeof tasks.$inferInsert> = {}) {
  const [task] = await db.insert(tasks).values({
    id: overrides.id ?? randomUUID(),
    projectId,
    title: overrides.title ?? `Task ${randomUUID().slice(0, 8)}`,
    descriptionMd: overrides.descriptionMd ?? '',
    statusId: overrides.statusId ?? null,
    startDate: overrides.startDate ?? null,
    dueDate: overrides.dueDate ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    createdBy,
  }).returning();

  return task satisfies Task;
}

export async function seedTaskAssignee(taskId: string, userId: string) {
  await db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing();
}

export async function seedDoc(projectId: string | null, createdBy: string, overrides: Partial<typeof docs.$inferInsert> = {}) {
  const [doc] = await db.insert(docs).values({
    id: overrides.id ?? randomUUID(),
    projectId,
    parentId: overrides.parentId ?? null,
    title: overrides.title ?? `Doc ${randomUUID().slice(0, 8)}`,
    content: overrides.content ?? [],
    searchText: overrides.searchText ?? '',
    properties: overrides.properties ?? {},
    isDatabase: overrides.isDatabase ?? false,
    isPolicy: overrides.isPolicy ?? false,
    schema: overrides.schema ?? null,
    createdBy,
  }).returning();

  return doc satisfies Doc;
}
