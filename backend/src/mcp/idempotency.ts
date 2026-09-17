import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, type DbTransaction } from '../db/client';
import { mcpIdempotencyKeys } from '../db/schema';
import type { AuthenticatedMcpUser } from '../services/mcpToken';
import { log } from '../utils/logger';
import { McpToolError } from './errors';
import { principalFor } from './principal';

export interface IdempotentOperationResult<T extends Record<string, unknown>> {
  response: T;
  resultEntityType?: string | null;
  resultEntityId?: string | null;
  afterCommit?: () => Promise<void>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function hashIdempotencyRequest(input: unknown): string {
  const request = input && typeof input === 'object' && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([key]) => key !== 'idempotencyKey'))
    : input;
  return createHash('sha256').update(JSON.stringify(canonicalize(request))).digest('hex');
}

export async function runIdempotentOperation<T extends Record<string, unknown>>(
  token: AuthenticatedMcpUser,
  key: string,
  toolName: string,
  input: unknown,
  operation: (transaction: DbTransaction) => Promise<IdempotentOperationResult<T>>,
  authorizeReplay: (response: T) => Promise<void>,
  toolVersion = 1,
): Promise<T> {
  const principal = principalFor(token);
  const requestHash = hashIdempotencyRequest(input);

  const committed = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(
      hashtext(${`${principal.type}:${principal.id}`}),
      hashtext(${`${toolName}:${key}`})
    )`);

    const [existing] = await tx
      .select({
        responseJson: mcpIdempotencyKeys.responseJson,
        requestHash: mcpIdempotencyKeys.requestHash,
        toolVersion: mcpIdempotencyKeys.toolVersion,
      })
      .from(mcpIdempotencyKeys)
      .where(and(
        eq(mcpIdempotencyKeys.principalType, principal.type),
        eq(mcpIdempotencyKeys.principalId, principal.id),
        eq(mcpIdempotencyKeys.key, key),
        eq(mcpIdempotencyKeys.toolName, toolName),
      ))
      .limit(1);

    if (existing) {
      if (existing.requestHash !== 'legacy'
        && (existing.requestHash !== requestHash || existing.toolVersion !== toolVersion)) {
        throw new McpToolError(
          'IDEMPOTENCY_KEY_REUSED',
          'This idempotency key was already used with a different request.',
          { toolName, idempotencyKey: key },
        );
      }
      return { response: existing.responseJson as T, replayed: true as const };
    }

    const result = await operation(tx);
    await tx.insert(mcpIdempotencyKeys).values({
      tokenId: principal.tokenId,
      userId: principal.userId,
      principalType: principal.type,
      principalId: principal.id,
      key,
      toolName,
      toolVersion,
      requestHash,
      resultEntityType: result.resultEntityType ?? null,
      resultEntityId: result.resultEntityId ?? null,
      responseJson: result.response as any,
    });

    return { response: result.response, replayed: false as const, afterCommit: result.afterCommit };
  });

  if (committed.replayed) {
    await authorizeReplay(committed.response);
  } else if (committed.afterCommit) {
    try {
      await committed.afterCommit();
    } catch (error) {
      log('warn', 'mcp.idempotent_after_commit_failed', { toolName, error });
    }
  }
  return committed.response;
}
