import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { notifications, type Notification, type NewNotification } from '../db/schema';

export interface NotificationQueryOptions {
  unreadOnly?: boolean;
  limit?: number;
}

export class NotificationRepository {
  async findById(id: string): Promise<Notification | null> {
    const result = await db.query.notifications.findFirst({
      where: eq(notifications.id, id),
    });
    return result || null;
  }

  async findByUserId(userId: string, options?: NotificationQueryOptions): Promise<Notification[]> {
    const conditions = [eq(notifications.userId, userId)];

    if (options?.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    return db.query.notifications.findMany({
      where: and(...conditions),
      orderBy: [desc(notifications.createdAt)],
      limit: options?.limit ?? 50,
    });
  }

  async create(data: NewNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }

  async markAsRead(id: string): Promise<Notification | null> {
    const [notification] = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification || null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId))
      .returning();
    return result.length;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(notifications).where(eq(notifications.id, id)).returning();
    return result.length > 0;
  }
}

export const notificationRepository = new NotificationRepository();
