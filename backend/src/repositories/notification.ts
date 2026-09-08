import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '../db/client';
import {
  emailNotificationDeliveries,
  notificationEmailPreferences,
  notifications,
  users,
  workspaceEmailControl,
  type Notification,
  type NewNotification,
} from '../db/schema';

export interface NotificationQueryOptions {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: { createdAt: Date; id: string };
}

export class NotificationRepository {
  async findById(id: string): Promise<Notification | null> {
    const result = await db.query.notifications.findFirst({
      where: eq(notifications.id, id),
    });
    return result || null;
  }

  async findByUserId(
    userId: string,
    options?: NotificationQueryOptions,
    executor: DbExecutor = db,
  ): Promise<Notification[]> {
    const conditions = [eq(notifications.userId, userId)];

    if (options?.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    if (options?.cursor) {
      conditions.push(or(
        lt(notifications.createdAt, options.cursor.createdAt),
        and(
          eq(notifications.createdAt, options.cursor.createdAt),
          lt(notifications.id, options.cursor.id),
        ),
      )!);
    }

    return executor.query.notifications.findMany({
      where: and(...conditions),
      orderBy: [desc(notifications.createdAt), desc(notifications.id)],
      limit: options?.limit ?? 50,
    });
  }

  async create(data: NewNotification, executor: DbExecutor = db): Promise<Notification | null> {
    const [notification] = await executor
      .insert(notifications)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return notification ?? null;
  }

  async createDeliveryIfEnabled(notification: Notification, executor: DbExecutor = db): Promise<void> {
    const [eligibility] = await executor
      .select({
        userGeneration: notificationEmailPreferences.generation,
        workspaceGeneration: workspaceEmailControl.generation,
      })
      .from(notificationEmailPreferences)
      .innerJoin(users, and(
        eq(users.id, notificationEmailPreferences.userId),
        eq(users.isDisabled, false),
      ))
      .innerJoin(workspaceEmailControl, eq(workspaceEmailControl.id, 1))
      .where(and(
        eq(notificationEmailPreferences.userId, notification.userId),
        eq(notificationEmailPreferences.type, notification.type),
        eq(notificationEmailPreferences.enabled, true),
        eq(workspaceEmailControl.enabled, true),
      ))
      .limit(1);

    if (!eligibility) return;

    await executor
      .insert(emailNotificationDeliveries)
      .values({
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        userGeneration: eligibility.userGeneration,
        workspaceGeneration: eligibility.workspaceGeneration,
        messageId: `<notification-${notification.id}@tuesday.local>`,
      })
      .onConflictDoNothing();
  }

  async markAsRead(id: string, userId?: string): Promise<Notification | null> {
    const [notification] = await db
      .update(notifications)
      .set({ read: true })
      .where(userId
        ? and(eq(notifications.id, id), eq(notifications.userId, userId))
        : eq(notifications.id, id))
      .returning();
    return notification || null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      .returning({ id: notifications.id });
    return result.length;
  }

  async countUnreadByUser(userId: string, executor: DbExecutor = db): Promise<number> {
    const [result] = await executor
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return Number(result?.count ?? 0);
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(notifications).where(eq(notifications.id, id)).returning();
    return result.length > 0;
  }
}

export const notificationRepository = new NotificationRepository();
