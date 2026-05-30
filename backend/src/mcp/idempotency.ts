import { eq, and, isNull } from 'drizzle-orm';
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
      eq(mcpIdempotencyKeys.key, key)
    ),
  });
  return existing ? (existing.responseJson as Record<string, unknown>) : null;
}

/**
 * Store the result of an idempotent operation so future retries return the same output.
 */
export async function storeIdempotencyKey(
  tokenId: string,
  key: string,
  toolName: string,
  resultEntityType: string | null,
  resultEntityId: string | null,
  responseJson: Record<string, unknown>
): Promise<void> {
  await db.insert(mcpIdempotencyKeys).values({
    tokenId,
    key,
    toolName,
    resultEntityType: resultEntityType ?? null,
    resultEntityId: resultEntityId ?? null,
    responseJson: responseJson as any,
  });
}