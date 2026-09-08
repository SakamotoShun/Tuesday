import { and, asc, desc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '../db/client';
import {
  EmailDeliveryState,
  emailNotificationDeliveries,
  notificationEmailPreferences,
  notifications,
  users,
  workspaceEmailControl,
  type EmailNotificationDelivery,
} from '../db/schema';

export interface AuthorisedEmailDelivery {
  id: string;
  leaseToken: string;
  email: string;
  recipientName: string;
  title: string;
  link: string | null;
  messageId: string;
}

const CLAIMABLE_STATES = [EmailDeliveryState.QUEUED, EmailDeliveryState.RETRY_WAIT] as const;

export class EmailNotificationDeliveryRepository {
  async claimBatch(limit: number, leaseMs: number): Promise<EmailNotificationDelivery[]> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const expiredBefore = now;
      const dueOrExpired = or(
        and(
          inArray(emailNotificationDeliveries.state, [...CLAIMABLE_STATES]),
          lte(emailNotificationDeliveries.nextAttemptAt, now),
        ),
        and(
          inArray(emailNotificationDeliveries.state, [
            EmailDeliveryState.LEASED,
            EmailDeliveryState.SENDING,
          ]),
          lt(emailNotificationDeliveries.leaseExpiresAt, expiredBefore),
        ),
      );

      await tx
        .update(emailNotificationDeliveries)
        .set({
          state: EmailDeliveryState.DEAD,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: 'Maximum delivery attempts reached',
          updatedAt: now,
        })
        .where(and(
          dueOrExpired,
          sql`${emailNotificationDeliveries.attemptCount} >= (${emailNotificationDeliveries.retryCycle} + 1) * 10`,
        ));

      const candidates = await tx
        .select()
        .from(emailNotificationDeliveries)
        .where(and(
          dueOrExpired,
          sql`${emailNotificationDeliveries.attemptCount} < (${emailNotificationDeliveries.retryCycle} + 1) * 10`,
        ))
        .orderBy(asc(emailNotificationDeliveries.nextAttemptAt), asc(emailNotificationDeliveries.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });

      const claimed: EmailNotificationDelivery[] = [];
      for (const candidate of candidates) {
        const leaseToken = crypto.randomUUID();
        const [delivery] = await tx
          .update(emailNotificationDeliveries)
          .set({
            state: candidate.state === EmailDeliveryState.SENDING
              ? EmailDeliveryState.SENDING
              : EmailDeliveryState.LEASED,
            leaseToken,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
            attemptCount: candidate.attemptCount + 1,
            updatedAt: now,
          })
          .where(eq(emailNotificationDeliveries.id, candidate.id))
          .returning();
        if (delivery) claimed.push(delivery);
      }
      return claimed;
    });
  }

  async resumeSending(
    id: string,
    leaseToken: string,
    leaseMs: number,
  ): Promise<AuthorisedEmailDelivery | null> {
    return db.transaction(async (tx) => {
      const [renewed] = await tx
        .update(emailNotificationDeliveries)
        .set({
          leaseExpiresAt: new Date(Date.now() + leaseMs),
          updatedAt: new Date(),
        })
        .where(and(
          eq(emailNotificationDeliveries.id, id),
          eq(emailNotificationDeliveries.state, EmailDeliveryState.SENDING),
          eq(emailNotificationDeliveries.leaseToken, leaseToken),
        ))
        .returning({ id: emailNotificationDeliveries.id });
      if (!renewed) return null;

      const [delivery] = await tx
        .select({
          id: emailNotificationDeliveries.id,
          leaseToken: emailNotificationDeliveries.leaseToken,
          email: emailNotificationDeliveries.authorisedEmail,
          messageId: emailNotificationDeliveries.messageId,
          recipientName: users.name,
          title: notifications.title,
          link: notifications.link,
        })
        .from(emailNotificationDeliveries)
        .innerJoin(users, eq(users.id, emailNotificationDeliveries.userId))
        .innerJoin(notifications, eq(notifications.id, emailNotificationDeliveries.notificationId))
        .where(eq(emailNotificationDeliveries.id, id));

      if (!delivery?.leaseToken || !delivery.email) return null;
      return {
        id: delivery.id,
        leaseToken: delivery.leaseToken,
        email: delivery.email,
        recipientName: delivery.recipientName,
        title: delivery.title,
        link: delivery.link,
        messageId: delivery.messageId,
      };
    });
  }

  async authoriseSending(
    id: string,
    leaseToken: string,
    smtpReady: boolean,
    leaseMs: number,
  ): Promise<AuthorisedEmailDelivery | null> {
    return db.transaction(async (tx) => {
      const [control] = await tx
        .select()
        .from(workspaceEmailControl)
        .where(eq(workspaceEmailControl.id, 1))
        .for('update');
      const [candidate] = await tx
        .select()
        .from(emailNotificationDeliveries)
        .where(eq(emailNotificationDeliveries.id, id));
      if (!candidate || candidate.state !== EmailDeliveryState.LEASED || candidate.leaseToken !== leaseToken) return null;

      const [user] = await tx.select().from(users).where(eq(users.id, candidate.userId)).for('update');
      const [preference] = await tx
        .select()
        .from(notificationEmailPreferences)
        .where(and(
          eq(notificationEmailPreferences.userId, candidate.userId),
          eq(notificationEmailPreferences.type, candidate.type),
        ))
        .for('update');
      const [delivery] = await tx
        .select()
        .from(emailNotificationDeliveries)
        .where(eq(emailNotificationDeliveries.id, id))
        .for('update');
      if (!delivery || delivery.state !== EmailDeliveryState.LEASED || delivery.leaseToken !== leaseToken) return null;

      const authorised = Boolean(
        smtpReady &&
        control?.enabled &&
        control.generation === delivery.workspaceGeneration &&
        preference?.enabled &&
        preference.generation === delivery.userGeneration &&
        user && !user.isDisabled,
      );

      if (!authorised) {
        const cancelled = !control?.enabled || !preference?.enabled || !user || user.isDisabled ||
          control?.generation !== delivery.workspaceGeneration || preference?.generation !== delivery.userGeneration;
        const exhausted = delivery.attemptCount >= (delivery.retryCycle + 1) * 10;
        await tx
          .update(emailNotificationDeliveries)
          .set({
            state: cancelled
              ? EmailDeliveryState.CANCELLED
              : exhausted ? EmailDeliveryState.DEAD : EmailDeliveryState.RETRY_WAIT,
            leaseToken: null,
            leaseExpiresAt: null,
            nextAttemptAt: cancelled ? delivery.nextAttemptAt : new Date(Date.now() + 60_000),
            lastError: cancelled
              ? null
              : exhausted ? 'Maximum delivery attempts reached' : 'SMTP configuration unavailable',
            updatedAt: new Date(),
          })
          .where(eq(emailNotificationDeliveries.id, id));
        return null;
      }

      const [notification] = await tx
        .select({ title: notifications.title, link: notifications.link })
        .from(notifications)
        .where(eq(notifications.id, delivery.notificationId));
      if (!notification) return null;

      const [sending] = await tx
        .update(emailNotificationDeliveries)
        .set({
          state: EmailDeliveryState.SENDING,
          authorisedEmail: user!.email,
          leaseExpiresAt: new Date(Date.now() + leaseMs),
          updatedAt: new Date(),
        })
        .where(and(
          eq(emailNotificationDeliveries.id, id),
          eq(emailNotificationDeliveries.leaseToken, leaseToken),
        ))
        .returning();
      if (!sending) return null;
      return {
        id,
        leaseToken,
        email: user!.email,
        recipientName: user!.name,
        title: notification.title,
        link: notification.link,
        messageId: sending.messageId,
      };
    });
  }

  async markSent(id: string, leaseToken: string): Promise<boolean> {
    const [sent] = await db
      .update(emailNotificationDeliveries)
      .set({
        state: EmailDeliveryState.SENT,
        sentAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(emailNotificationDeliveries.id, id),
        eq(emailNotificationDeliveries.leaseToken, leaseToken),
        eq(emailNotificationDeliveries.state, EmailDeliveryState.SENDING),
      ))
      .returning({ id: emailNotificationDeliveries.id });
    return Boolean(sent);
  }

  async markFailed(delivery: EmailNotificationDelivery, errorMessage: string): Promise<'retry' | 'dead' | null> {
    const maxAttempts = (delivery.retryCycle + 1) * 10;
    const dead = delivery.attemptCount >= maxAttempts;
    const backoffMs = Math.min(3_600_000, 2 ** Math.min(delivery.attemptCount, 12) * 1_000) +
      Math.floor(Math.random() * 1_000);
    const [updated] = await db
      .update(emailNotificationDeliveries)
      .set({
        state: dead ? EmailDeliveryState.DEAD : EmailDeliveryState.RETRY_WAIT,
        nextAttemptAt: new Date(Date.now() + backoffMs),
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: errorMessage.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(and(
        eq(emailNotificationDeliveries.id, delivery.id),
        eq(emailNotificationDeliveries.leaseToken, delivery.leaseToken!),
        eq(emailNotificationDeliveries.state, EmailDeliveryState.SENDING),
      ))
      .returning({ id: emailNotificationDeliveries.id });
    if (!updated) return null;
    return dead ? 'dead' : 'retry';
  }

  async getQueueStats(executor: DbExecutor = db) {
    const rows = await executor
      .select({
        state: emailNotificationDeliveries.state,
        count: sql<number>`count(*)::int`,
      })
      .from(emailNotificationDeliveries)
      .groupBy(emailNotificationDeliveries.state);
    const counts = Object.fromEntries(Object.values(EmailDeliveryState).map((state) => [state, 0]));
    for (const row of rows) counts[row.state] = row.count;
    return counts;
  }

  async listDead(
    limit = 50,
    cursor?: { updatedAt: Date; id: string },
    executor: DbExecutor = db,
  ) {
    const cursorCondition = cursor
      ? or(
        lt(emailNotificationDeliveries.updatedAt, cursor.updatedAt),
        and(
          eq(emailNotificationDeliveries.updatedAt, cursor.updatedAt),
          lt(emailNotificationDeliveries.id, cursor.id),
        ),
      )
      : undefined;
    const rows = await executor
      .select({
        id: emailNotificationDeliveries.id,
        type: emailNotificationDeliveries.type,
        attemptCount: emailNotificationDeliveries.attemptCount,
        retryCycle: emailNotificationDeliveries.retryCycle,
        lastError: emailNotificationDeliveries.lastError,
        createdAt: emailNotificationDeliveries.createdAt,
        updatedAt: emailNotificationDeliveries.updatedAt,
      })
      .from(emailNotificationDeliveries)
      .where(and(
        eq(emailNotificationDeliveries.state, EmailDeliveryState.DEAD),
        cursorCondition,
      ))
      .orderBy(desc(emailNotificationDeliveries.updatedAt), desc(emailNotificationDeliveries.id))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map((row) => ({
      ...row,
      retryable: row.retryCycle < 3,
    }));
  }

  async retryDead(id: string): Promise<boolean> {
    const [delivery] = await db
      .select()
      .from(emailNotificationDeliveries)
      .where(and(
        eq(emailNotificationDeliveries.id, id),
        eq(emailNotificationDeliveries.state, EmailDeliveryState.DEAD),
      ));
    if (!delivery || delivery.retryCycle >= 3) return false;
    const [updated] = await db
      .update(emailNotificationDeliveries)
      .set({
        state: EmailDeliveryState.QUEUED,
        retryCycle: delivery.retryCycle + 1,
        nextAttemptAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(emailNotificationDeliveries.id, id),
        eq(emailNotificationDeliveries.state, EmailDeliveryState.DEAD),
      ))
      .returning({ id: emailNotificationDeliveries.id });
    return Boolean(updated);
  }
}

export const emailNotificationDeliveryRepository = new EmailNotificationDeliveryRepository();
