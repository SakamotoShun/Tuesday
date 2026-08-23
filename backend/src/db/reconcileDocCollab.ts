import { asc, count, desc, eq, isNull, max, sql } from 'drizzle-orm';
import * as Y from 'yjs';
import {
  deriveValidatedDocBlocks,
  DocInvalidUpdateError,
  DocSyncBusyError,
  DocSyncTooLargeError,
  materializeDocHistory,
  MAX_DOC_SYNC_PAYLOAD_BYTES,
} from '../collab/docHistory';
import { buildDocSyncState } from '../collab/sync';
import { yDocFromBlocks } from '../collab/docContent';
import { docCollabRepository } from '../repositories/docCollab';
import { log } from '../utils/logger';
import { db } from './client';
import { docs, docCollabSnapshots, docCollabUpdates } from './schema';

const DOC_BATCH_SIZE = 100;

function isInvalidHistoryError(error: unknown): boolean {
  return error instanceof DocInvalidUpdateError || error instanceof DocSyncTooLargeError;
}

async function buildCompleteSyncState(docId: string) {
  while (true) {
    const before = await docCollabRepository.getLatestSnapshot(docId);
    try {
      return await buildDocSyncState(docCollabRepository, docId);
    } catch (error) {
      if (!(error instanceof DocSyncBusyError)) {
        throw error;
      }

      const after = await docCollabRepository.getLatestSnapshot(docId);
      const madeProgress = after?.id !== before?.id || after?.seq !== before?.seq;
      if (!madeProgress) {
        throw error;
      }
    }
  }
}

async function reconcileValidHistory(docId: string): Promise<'reconciled' | 'skipped'> {
  while (true) {
    const state = await buildCompleteSyncState(docId);
    const ydoc = materializeDocHistory(state.snapshot, state.updates);
    deriveValidatedDocBlocks(ydoc);
    const snapshot = Y.encodeStateAsUpdate(ydoc);
    if (snapshot.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
      throw new DocSyncTooLargeError(snapshot.byteLength);
    }

    const result = await docCollabRepository.persistCanonicalSnapshot(docId, snapshot, state.latestSeq);
    if (result.status === 'persisted') {
      return 'reconciled';
    }
    if (result.status === 'not_found') {
      return 'skipped';
    }
    if (result.status === 'stale_seq') {
      continue;
    }
    throw new Error(`Server-generated collaboration snapshot diverged for document ${docId}`);
  }
}

async function resetInvalidHistory(docId: string, error: unknown): Promise<'reset' | 'skipped'> {
  const outcome = await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(docs).where(eq(docs.id, docId)).for('update');
    if (!doc || doc.canonicalCollabSeq !== null) {
      return { status: 'skipped' as const };
    }

    const snapshot = await tx
      .select({
        seq: docCollabSnapshots.seq,
        size: sql<number>`octet_length(${docCollabSnapshots.snapshot})`,
      })
      .from(docCollabSnapshots)
      .where(eq(docCollabSnapshots.docId, docId))
      .orderBy(desc(docCollabSnapshots.seq), desc(docCollabSnapshots.createdAt))
      .limit(1);
    const [updateStats] = await tx
      .select({
        count: count(),
        maxSeq: max(docCollabUpdates.seq),
        bytes: sql<number>`COALESCE(SUM(octet_length(${docCollabUpdates.update})), 0)`,
      })
      .from(docCollabUpdates)
      .where(eq(docCollabUpdates.docId, docId));

    let baseline: Uint8Array;
    try {
      const baselineDoc = yDocFromBlocks(doc.content);
      deriveValidatedDocBlocks(baselineDoc);
      baseline = Y.encodeStateAsUpdate(baselineDoc);
    } catch (cause) {
      throw new Error(`Canonical content for document ${docId} cannot seed collaboration recovery`, { cause });
    }
    if (baseline.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
      throw new DocSyncTooLargeError(baseline.byteLength);
    }

    await tx.delete(docCollabUpdates).where(eq(docCollabUpdates.docId, docId));
    await tx.delete(docCollabSnapshots).where(eq(docCollabSnapshots.docId, docId));
    await tx.insert(docCollabSnapshots).values({ docId, seq: 0, snapshot: Buffer.from(baseline) });
    await tx.update(docs).set({ canonicalCollabSeq: 0 }).where(eq(docs.id, docId));

    return {
      status: 'reset' as const,
      baseSeq: snapshot[0]?.seq ?? 0,
      updateCount: Number(updateStats?.count ?? 0),
      latestSeq: Number(updateStats?.maxSeq ?? snapshot[0]?.seq ?? 0),
      payloadBytes: Number(snapshot[0]?.size ?? 0) + Number(updateStats?.bytes ?? 0),
    };
  });

  if (outcome.status === 'reset') {
    log('warn', 'doc_collab.recovery_reset', {
      doc_id: docId,
      reason: error instanceof Error ? error.name : 'UnknownError',
      base_seq: outcome.baseSeq,
      latest_seq: outcome.latestSeq,
      update_count: outcome.updateCount,
      payload_bytes: outcome.payloadBytes,
    });
  }
  return outcome.status;
}

export async function reconcileCanonicalDocCollabHistory(): Promise<void> {
  let reconciled = 0;
  let reset = 0;

  while (true) {
    const candidates = await db
      .select({ id: docs.id })
      .from(docs)
      .where(isNull(docs.canonicalCollabSeq))
      .orderBy(asc(docs.id))
      .limit(DOC_BATCH_SIZE);
    if (candidates.length === 0) {
      break;
    }

    for (const { id: docId } of candidates) {
      let outcome: 'reconciled' | 'reset' | 'skipped';
      try {
        outcome = await reconcileValidHistory(docId);
      } catch (error) {
        if (!isInvalidHistoryError(error)) {
          throw error;
        }
        outcome = await resetInvalidHistory(docId, error);
      }

      if (outcome === 'reconciled') reconciled += 1;
      if (outcome === 'reset') reset += 1;
    }
  }

  await db.execute(sql.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'doc_collab_updates_update_size_check'
          AND conrelid = 'doc_collab_updates'::regclass
      ) THEN
        ALTER TABLE "doc_collab_updates"
          VALIDATE CONSTRAINT "doc_collab_updates_update_size_check";
      END IF;
    END $$
  `));
  log('info', 'doc_collab.recovery_completed', { reconciled_count: reconciled, reset_count: reset });
}
