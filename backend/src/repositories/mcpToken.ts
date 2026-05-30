import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { mcpTokens, type McpToken, type NewMcpToken } from '../db/schema';

export class McpTokenRepository {
  async create(data: NewMcpToken): Promise<McpToken> {
    const [token] = await db.insert(mcpTokens).values(data).returning();
    return token;
  }

  async findByHash(tokenHash: string): Promise<(McpToken & {
    user?: { id: string; name: string; email: string; role: string } | null;
  }) | null> {
    const result = await db.query.mcpTokens.findFirst({
      where: and(
        eq(mcpTokens.tokenHash, tokenHash),
        isNull(mcpTokens.revokedAt),
      ),
      with: {
        user: {
          columns: { id: true, name: true, email: true, role: true },
        },
      },
    });
    return result || null;
  }

  async findByUserId(userId: string): Promise<McpToken[]> {
    return db.query.mcpTokens.findMany({
      where: eq(mcpTokens.userId, userId),
      orderBy: [desc(mcpTokens.createdAt)],
    });
  }

  async markUsed(id: string): Promise<void> {
    await db
      .update(mcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpTokens.id, id));
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const result = await db
      .update(mcpTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId)))
      .returning({ id: mcpTokens.id });
    return result.length > 0;
  }
}

export const mcpTokenRepository = new McpTokenRepository();