import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { mcpIdempotencyKeys } from '../db/schema';

/**
 * Check if an idempotency key has already been used by this token.
 * If so, return the saved response.
 * Otherwise, return null (proceed with the operation).
 */
export async function checkIdempotencyKey(
  tokenId: string,
  key: string,
  toolName: string
): Promise<Record<string, unknown> | null> {
  const existing = await db.query.mcpIdempotencyKeys.findFirst({
    where: and(
      eq(mcpIdempotencyKeys.tokenId, tokenId),
      eq(mcpIdempotencyKeys.key, key),
      eq(mcpIdempotencyKeys.toolName, toolName)
    ),
  });
  return existing ? (existing.responseJson as Record<string, unknown>) : null;
}

export interface IdempotentOperationResult<T extends Record<string, unknown>> {
  response: T;
  resultEntityType?: string | null;
  resultEntityId?: string | null;
}

export async function runIdempotentOperation<T extends Record<string, unknown>>(
  tokenId: string,
  key: string,
  toolName: string,
  operation: () => Promise<IdempotentOperationResult<T>>
): Promise<T> {
  return db.transaction(async (tx) => {
    // Serialize concurrent retries for the same token/tool/key triplet.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tokenId}), hashtext(${`${toolName}:${key}`}))`);

    const [existing] = await tx
      .select({ responseJson: mcpIdempotencyKeys.responseJson })
      .from(mcpIdempotencyKeys)
      .where(and(
        eq(mcpIdempotencyKeys.tokenId, tokenId),
        eq(mcpIdempotencyKeys.key, key),
        eq(mcpIdempotencyKeys.toolName, toolName)
      ))
      .limit(1);

    if (existing) {
      return existing.responseJson as T;
    }

    const result = await operation();

    await tx.insert(mcpIdempotencyKeys).values({
      tokenId,
      key,
      toolName,
      resultEntityType: result.resultEntityType ?? null,
      resultEntityId: result.resultEntityId ?? null,
      responseJson: result.response as any,
    }).onConflictDoNothing({
      target: [mcpIdempotencyKeys.tokenId, mcpIdempotencyKeys.key, mcpIdempotencyKeys.toolName],
    });

    return result.response;
  });
}
