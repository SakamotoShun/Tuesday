import { eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, users, type Session, type NewSession, type User } from '../db/schema';

export class SessionRepository {
  async create(data: NewSession): Promise<Session> {
    const [session] = await db.insert(sessions).values(data).returning();
    return session;
  }

  async findById(id: string): Promise<Session | null> {
    const result = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    return result || null;
  }

  async findByIdWithUser(id: string): Promise<{ session: Session; user: User } | null> {
    const sessionResult = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });

    if (!sessionResult) return null;

    const userResult = await db.query.users.findFirst({
      where: eq(users.id, sessionResult.userId),
    });

    if (!userResult) return null;
    
    return {
      session: sessionResult,
      user: userResult,
    };
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(sessions).where(eq(sessions.id, id)).returning();
    return result.length > 0;
  }

  async deleteExpired(): Promise<number> {
    const result = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await db
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning();
    return result.length;
  }

  async count(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(sessions);
    return result[0].count;
  }
}

export const sessionRepository = new SessionRepository();
