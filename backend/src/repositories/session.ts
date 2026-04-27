import { eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, users, type Session, type NewSession, type User } from '../db/schema';

const SESSION_CACHE_TTL_MS = 30_000;
const SESSION_CACHE_MAX_SIZE = 5_000;
const SESSION_CACHE_PRUNE_LIMIT = 64;

type SessionWithUser = { session: Session; user: User };

interface SessionCacheEntry {
  userId: string;
  value: SessionWithUser;
  cachedAt: number;
}

const sessionCache = new Map<string, SessionCacheEntry>();
const sessionCacheByUserId = new Map<string, Set<string>>();

function addCachedSessionIndex(userId: string, sessionId: string) {
  const sessionIds = sessionCacheByUserId.get(userId);
  if (sessionIds) {
    sessionIds.add(sessionId);
    return;
  }

  sessionCacheByUserId.set(userId, new Set([sessionId]));
}

function removeCachedSession(sessionId: string) {
  const entry = sessionCache.get(sessionId);
  if (!entry) {
    return false;
  }

  sessionCache.delete(sessionId);

  const sessionIds = sessionCacheByUserId.get(entry.userId);
  if (sessionIds) {
    sessionIds.delete(sessionId);
    if (sessionIds.size === 0) {
      sessionCacheByUserId.delete(entry.userId);
    }
  }

  return true;
}

function pruneExpiredCachedSessions(now: number) {
  let inspected = 0;

  for (const [sessionId, entry] of sessionCache) {
    if (inspected >= SESSION_CACHE_PRUNE_LIMIT) {
      break;
    }

    inspected += 1;

    if (now - entry.cachedAt > SESSION_CACHE_TTL_MS) {
      removeCachedSession(sessionId);
    }
  }
}

function getCachedSession(sessionId: string): SessionWithUser | null {
  const entry = sessionCache.get(sessionId);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > SESSION_CACHE_TTL_MS) {
    removeCachedSession(sessionId);
    return null;
  }

  sessionCache.delete(sessionId);
  sessionCache.set(sessionId, entry);
  return entry.value;
}

function setCachedSession(sessionId: string, value: SessionWithUser) {
  const now = Date.now();
  pruneExpiredCachedSessions(now);
  removeCachedSession(sessionId);

  sessionCache.set(sessionId, {
    userId: value.user.id,
    value,
    cachedAt: now,
  });
  addCachedSessionIndex(value.user.id, sessionId);

  if (sessionCache.size <= SESSION_CACHE_MAX_SIZE) {
    return;
  }

  const oldestKey = sessionCache.keys().next().value;
  if (oldestKey) {
    removeCachedSession(oldestKey);
  }
}

export class SessionRepository {
  async create(data: NewSession): Promise<Session> {
    const [session] = await db.insert(sessions).values(data).returning();
    removeCachedSession(session.id);
    return session;
  }

  async findById(id: string): Promise<Session | null> {
    const result = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    return result || null;
  }

  async findByIdWithUser(id: string): Promise<{ session: Session; user: User } | null> {
    const cached = getCachedSession(id);
    if (cached) {
      return cached;
    }

    const [result] = await db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, id))
      .limit(1);

    if (!result) {
      return null;
    }

    const value = {
      session: result.session,
      user: result.user,
    };

    setCachedSession(id, value);
    return value;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(sessions).where(eq(sessions.id, id)).returning();
    removeCachedSession(id);
    return result.length > 0;
  }

  async deleteExpired(): Promise<number> {
    const result = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .returning();

    for (const deletedSession of result) {
      removeCachedSession(deletedSession.id);
    }

    return result.length;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await db
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning();

    for (const deletedSession of result) {
      removeCachedSession(deletedSession.id);
    }

    return result.length;
  }

  invalidateByUserId(userId: string) {
    const sessionIds = sessionCacheByUserId.get(userId);
    if (!sessionIds) {
      return;
    }

    for (const sessionId of Array.from(sessionIds)) {
      removeCachedSession(sessionId);
    }
  }

  async count(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(sessions);
    return result[0].count;
  }
}

export const sessionRepository = new SessionRepository();
