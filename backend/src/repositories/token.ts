import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db/client';
import { tokens, type Token, type NewToken } from '../db/schema';

export class TokenRepository {
  async create(data: NewToken): Promise<Token> {
    const [token] = await db.insert(tokens).values(data).returning();
    return token;
  }

  async findActiveByTokenHash(tokenHash: string, type: string): Promise<Token | null> {
    const result = await db.query.tokens.findFirst({
      where: and(
        eq(tokens.tokenHash, tokenHash),
        eq(tokens.type, type),
        isNull(tokens.usedAt),
        gt(tokens.expiresAt, new Date()),
      ),
    });

    return result ?? null;
  }

  async markUsed(id: string): Promise<boolean> {
    const result = await db
      .update(tokens)
      .set({ usedAt: new Date() })
      .where(and(eq(tokens.id, id), isNull(tokens.usedAt), gt(tokens.expiresAt, new Date())))
      .returning({ id: tokens.id });

    return result.length > 0;
  }

  async deleteByUserAndType(userId: string, type: string): Promise<number> {
    const result = await db
      .delete(tokens)
      .where(and(eq(tokens.userId, userId), eq(tokens.type, type)))
      .returning({ id: tokens.id });

    return result.length;
  }

  async deleteExpiredOrUsed(): Promise<number> {
    const result = await db
      .delete(tokens)
      .where(
        or(
          lt(tokens.expiresAt, new Date()),
          isNotNull(tokens.usedAt),
        ),
      )
      .returning({ id: tokens.id });

    return result.length;
  }
}

export const tokenRepository = new TokenRepository();
