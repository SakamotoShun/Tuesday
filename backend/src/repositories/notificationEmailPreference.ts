import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  EmailDeliveryState,
  NotificationType,
  emailNotificationDeliveries,
  notificationEmailPreferences,
  workspaceEmailControl,
  type NotificationType as NotificationTypeValue,
} from '../db/schema';

export const NOTIFICATION_EMAIL_TYPES = Object.values(NotificationType);

export type NotificationEmailPreferences = Record<NotificationTypeValue, boolean>;

export class NotificationEmailPreferenceRepository {
  async getForUser(userId: string): Promise<NotificationEmailPreferences> {
    const rows = await db
      .select({ type: notificationEmailPreferences.type, enabled: notificationEmailPreferences.enabled })
      .from(notificationEmailPreferences)
      .where(eq(notificationEmailPreferences.userId, userId));

    const preferences = Object.fromEntries(
      NOTIFICATION_EMAIL_TYPES.map((type) => [type, false]),
    ) as NotificationEmailPreferences;
    for (const row of rows) {
      if (NOTIFICATION_EMAIL_TYPES.includes(row.type as NotificationTypeValue)) {
        preferences[row.type as NotificationTypeValue] = row.enabled;
      }
    }
    return preferences;
  }

  async updateForUser(userId: string, updates: Partial<NotificationEmailPreferences>): Promise<NotificationEmailPreferences> {
    await db.transaction(async (tx) => {
      await tx.select().from(workspaceEmailControl).where(eq(workspaceEmailControl.id, 1)).for('update');

      for (const type of NOTIFICATION_EMAIL_TYPES) {
        const enabled = updates[type];
        if (enabled === undefined) continue;

        const [current] = await tx
          .select()
          .from(notificationEmailPreferences)
          .where(and(
            eq(notificationEmailPreferences.userId, userId),
            eq(notificationEmailPreferences.type, type),
          ))
          .for('update');

        if (!current) {
          await tx.insert(notificationEmailPreferences).values({
            userId,
            type,
            enabled,
            generation: enabled ? 1 : 0,
          });
        } else if (current.enabled !== enabled) {
          await tx
            .update(notificationEmailPreferences)
            .set({ enabled, generation: current.generation + 1, updatedAt: new Date() })
            .where(and(
              eq(notificationEmailPreferences.userId, userId),
              eq(notificationEmailPreferences.type, type),
            ));
        }

        if (!enabled) {
          await tx
            .update(emailNotificationDeliveries)
            .set({
              state: EmailDeliveryState.CANCELLED,
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(and(
              eq(emailNotificationDeliveries.userId, userId),
              eq(emailNotificationDeliveries.type, type),
              inArray(emailNotificationDeliveries.state, [
                EmailDeliveryState.QUEUED,
                EmailDeliveryState.LEASED,
                EmailDeliveryState.RETRY_WAIT,
              ]),
            ));
        }
      }
    });

    return this.getForUser(userId);
  }

  async getWorkspaceControl() {
    const [control] = await db
      .select()
      .from(workspaceEmailControl)
      .where(eq(workspaceEmailControl.id, 1));
    return control ?? { id: 1, enabled: false, generation: 0, updatedAt: new Date(0) };
  }

  async setWorkspaceEnabled(enabled: boolean) {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(workspaceEmailControl)
        .where(eq(workspaceEmailControl.id, 1))
        .for('update');
      const generation = current && current.enabled !== enabled
        ? current.generation + 1
        : (current?.generation ?? 0);

      const [control] = await tx
        .insert(workspaceEmailControl)
        .values({ id: 1, enabled, generation, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: workspaceEmailControl.id,
          set: { enabled, generation, updatedAt: new Date() },
        })
        .returning();

      if (!enabled) {
        await tx
          .update(emailNotificationDeliveries)
          .set({
            state: EmailDeliveryState.CANCELLED,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(inArray(emailNotificationDeliveries.state, [
            EmailDeliveryState.QUEUED,
            EmailDeliveryState.LEASED,
            EmailDeliveryState.RETRY_WAIT,
          ]));
      }

      return control;
    });
  }
}

export const notificationEmailPreferenceRepository = new NotificationEmailPreferenceRepository();
