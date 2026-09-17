import { and, asc, desc, eq, gt, lte, sql, isNotNull } from 'drizzle-orm';
import * as Y from 'yjs';
import { createHash } from 'node:crypto';
import {
  applyAndValidateDocUpdate,
  deriveValidatedDocBlocks,
  docStatesEqual,
  DocNotFoundError,
  DocInvalidUpdateError,
  DocGenerationMismatchError,
  DocSyncBusyError,
  DocSyncTooLargeError,
  materializeDocHistory,
  MAX_COLLAB_SYNC_UPDATES,
  MAX_DOC_SYNC_PAYLOAD_BYTES,
} from '../collab/docHistory';
import { db, type DbTransaction } from '../db/client';
import { docs, docCollabSnapshots, docCollabUpdates, docCollabOperations, activityLogs } from '../db/schema';
import {
  checkpointDocHistory, compactCurrentDocHistory, deleteStaleSnapshots, ensureBaseline,
  getDurableLatestSeq, getLatestSnapshot, loadBoundedHistory, lockDoc, readCurrentDocHistory,
  type LockedDoc,
  projectCurrentDocHistory, projectLockedDoc, assertCurrentProjectionSupported,
} from './docCollabHistory';
import { log } from '../utils/logger';
import { assertCurrentDocAccess } from './docAccess';
import { issueSpan, applySpan, DocSpanError, type SpanReference } from '../collab/docSpan';

function assertDocGeneration(doc: LockedDoc, generation: string) {
  if (doc.collabGeneration !== generation) throw new DocGenerationMismatchError();
}

export type PersistCanonicalSnapshotResult =
  | { status: 'persisted'; doc: LockedDoc }
  | { status: 'stale_seq'; currentSeq: number }
  | { status: 'state_mismatch'; currentSeq: number }
  | { status: 'not_found' };

/** Compose an append with other DB work without opening a nested transaction. */
export interface DocUpdateOptions {
  generation?: string;
  operationId?: string;
  recheckAccess?: boolean;
  /** Benchmark comparison; production uses locked reads and the server refresh queue. */
  project?: boolean;
}

export async function appendDocUpdate(tx: DbTransaction, docId: string, update: Uint8Array, actorId: string, options: DocUpdateOptions = {}) {
  const doc = await lockDoc(tx, docId);
  if (options.recheckAccess) await assertCurrentDocAccess(tx, doc, actorId, true);
  if (options.generation !== undefined) assertDocGeneration(doc, options.generation);
  let requestHash: string | undefined;
  if (options.operationId !== undefined) {
    if (!options.generation || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(options.operationId)) {
      throw new DocInvalidUpdateError('Operation identity requires a valid ID and generation');
    }
    // Preserve the ordinary-update receipt digest used before evidence removal.
    requestHash = createHash('sha256').update(update).update('\0null').digest('hex');
    const [receipt] = await tx.select().from(docCollabOperations).where(and(eq(docCollabOperations.docId, docId),
      eq(docCollabOperations.generation, doc.collabGeneration), eq(docCollabOperations.operationId, options.operationId)));
    if (receipt) {
      if (receipt.actorId !== actorId || receipt.requestHash !== requestHash) {
        throw new DocInvalidUpdateError('Operation identity was reused with different content or author');
      }
      return receipt.seq;
    }
  }
  const recordOperation = async (seq: number) => {
    if (options.operationId && requestHash) await tx.insert(docCollabOperations).values({
      docId, generation: doc.collabGeneration, operationId: options.operationId, actorId, requestHash, seq,
    });
    return seq;
  };
  const snapshot = await ensureBaseline(tx, doc);
  const history = await loadBoundedHistory(tx, docId, snapshot);
  if (history.hasMore) {
    throw new DocSyncBusyError('Document history must be compacted before accepting updates');
  }
  const validated = applyAndValidateDocUpdate(snapshot?.snapshot ?? null, history.updates.map(item => item.update), update);
  try {
    const checkpointNeeded = history.updates.length + 1 >= MAX_COLLAB_SYNC_UPDATES
      || history.payloadBytes + update.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES;
    // Measure the resulting state, not snapshot + update: replays are
    // idempotent, and deletions can make the state smaller.
    const state = checkpointNeeded ? Y.encodeStateAsUpdate(validated.doc) : null;
    if (state && state.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
      throw new DocSyncTooLargeError(state.byteLength);
    }
    const [result] = await tx.insert(docCollabUpdates)
      .values({ docId, update: Buffer.from(update), actorId })
      .returning({ seq: docCollabUpdates.seq });
    if (!result) throw new Error('Failed to append document update');
    if (state) await checkpointDocHistory(tx, docId, state, result.seq);
    if (options.project) {
      assertCurrentProjectionSupported(validated.doc.getXmlFragment('prosemirror'));
      await projectLockedDoc(tx, doc, validated.blocks, result.seq);
    } else if (!doc.collabProjectionPendingAt) {
      await tx.update(docs).set({ collabProjectionPendingAt: new Date() }).where(eq(docs.id, docId));
    }
    return await recordOperation(result.seq);
  } finally { validated.doc.destroy(); }
}

/** Caller authorises before entering; all preparation remains in this transaction. */
export async function issueCurrentSpan(tx: DbTransaction, docId: string, blockId: string, from: number, to: number, inlineIndex = 0) {
  const current = await projectCurrentDocHistory(tx, docId);
  const issued = await issueSpansAtCurrent(tx, current, [{ blockId, from, to, inlineIndex }]);
  return { generation: issued.generation, collabSeq: issued.collabSeq, reference: issued.references[0]! };
}

export interface CurrentSpanSelection { blockId: string; from: number; to: number; inlineIndex: number }

/** The caller owns the current state's document lock; all references share its exact cut. */
export async function issueSpansAtCurrent(tx: DbTransaction, current: Awaited<ReturnType<typeof projectCurrentDocHistory>>,
  selections: CurrentSpanSelection[]) {
  if (selections.length > 20) throw new DocSpanError('LIMIT_EXCEEDED', 'Too many span references');
  if (!selections.length) return { generation: current.doc.collabGeneration, collabSeq: current.collabSeq, references: [] };
  const references = selections.map(selection => issueSpan(current.state, selection.blockId, selection.from, selection.to, selection.inlineIndex));
  return { generation: current.doc.collabGeneration, references, collabSeq: current.collabSeq };
}

/** Compose inside runIdempotentOperation: advisory lock -> doc lock -> delta/audit/receipt. */
export async function applyCurrentSpan(tx: DbTransaction, input: {
  docId: string; generation: string; reference: SpanReference; text: string; actorId: string;
}) {
  const doc = await lockDoc(tx, input.docId);
  assertDocGeneration(doc, input.generation);
  const current = await projectCurrentDocHistory(tx, input.docId);
  const result = applySpan(current.state, input.reference, input.text);
  const seq = await appendDocUpdate(tx, input.docId, result.update, input.actorId, {
    generation: input.generation, project: true,
  });
  const [updated] = await tx.select({ version: docs.version }).from(docs).where(eq(docs.id, input.docId));
  await tx.insert(activityLogs).values({ actorId: input.actorId, action: 'doc.patched', entityType: 'doc',
    entityId: doc.id, entityName: doc.title, projectId: doc.projectId,
    metadata: { generation: input.generation, collabSeq: seq } });
  return { update: result.update, response: { docId: doc.id, generation: input.generation, collabSeq: seq, version: updated!.version } };
}

export class DocCollabRepository {
  /** Repository groundwork only; services must authorise before calling. */
  async readCurrent(docId: string) {
    return db.transaction(tx => readCurrentDocHistory(tx, docId));
  }

  async compactCurrent(docId: string) {
    return db.transaction(tx => compactCurrentDocHistory(tx, docId));
  }

  async projectCurrent(docId: string, authorised?: Pick<LockedDoc, 'projectId' | 'createdBy'> & { userId: string }) {
    return db.transaction(async tx => {
      const doc = await lockDoc(tx, docId);
      if (authorised && (doc.projectId !== authorised.projectId || doc.createdBy !== authorised.createdBy)) {
        throw new Error('Access denied: document ownership changed during read');
      }
      if (authorised) await assertCurrentDocAccess(tx, doc, authorised.userId);
      return projectCurrentDocHistory(tx, docId);
    });
  }

  /** Bounded server discovery repair, independent of browser snapshots. */
  async refreshProjections(limit = 20) {
    let refreshed = 0;
    for (let i = 0; i < Math.min(Math.max(limit, 0), 20); i++) {
      const found = await db.transaction(async tx => {
        const [doc] = await tx.select().from(docs).where(and(isNotNull(docs.collabProjectionPendingAt),
          lte(docs.collabProjectionPendingAt, new Date())))
          .orderBy(asc(docs.collabProjectionPendingAt), asc(docs.id)).limit(1).for('update', { skipLocked: true });
        if (!doc) return false;
        try {
          await tx.transaction(inner => projectCurrentDocHistory(inner, doc.id));
          refreshed++;
        } catch (error) {
          // Keep a failed document discoverable for repair without starving healthy work.
          await tx.update(docs).set({ collabProjectionPendingAt: new Date(Date.now() + 30_000) }).where(eq(docs.id, doc.id));
          log('warn', 'doc_collab.projection_failed', { doc_id: doc.id, error });
        }
        return true;
      });
      if (!found) break;
    }
    return refreshed;
  }

  async getLatestSnapshot(docId: string) {
    return db.query.docCollabSnapshots.findFirst({
      where: eq(docCollabSnapshots.docId, docId),
      orderBy: [desc(docCollabSnapshots.seq), desc(docCollabSnapshots.createdAt)],
    });
  }

  async getUpdatesInRange(docId: string, minSeqExclusive: number, maxSeqInclusive: number, limit?: number) {
    return db.query.docCollabUpdates.findMany({
      where: and(
        eq(docCollabUpdates.docId, docId),
        gt(docCollabUpdates.seq, minSeqExclusive),
        lte(docCollabUpdates.seq, maxSeqInclusive),
      ),
      orderBy: [asc(docCollabUpdates.seq)],
      ...(typeof limit === 'number' ? { limit } : {}),
    });
  }

  async getUpdatesSince(docId: string, seq: number, limit?: number) {
    const latestSeq = await this.getLatestSeq(docId);
    return this.getUpdatesInRange(docId, seq, latestSeq, limit);
  }

  async loadSyncState(docId: string) {
    return db.transaction(async (tx) => {
      const doc = await lockDoc(tx, docId);
      const snapshot = await ensureBaseline(tx, doc);
      const history = await loadBoundedHistory(tx, docId, snapshot);
      return {
        snapshot,
        updates: history.updates,
        latestSeq: history.throughSeq,
        hasMore: history.hasMore,
        docVersion: doc.version,
        canonicalSeq: doc.canonicalCollabSeq,
        baseSnapshotId: snapshot?.id ?? null,
        baseSeq: snapshot?.seq ?? 0,
        generation: doc.collabGeneration,
      };
    });
  }

  async getLatestSeq(docId: string) {
    const [latest] = await db.select({
      seq: sql<number>`GREATEST(
        COALESCE((SELECT MAX(${docCollabUpdates.seq}) FROM ${docCollabUpdates} WHERE ${docCollabUpdates.docId} = ${docId}), 0),
        COALESCE((SELECT MAX(${docCollabSnapshots.seq}) FROM ${docCollabSnapshots} WHERE ${docCollabSnapshots.docId} = ${docId}), 0)
      )`,
    }).from(docs).where(eq(docs.id, docId)).limit(1);
    if (!latest) {
      throw new DocNotFoundError();
    }
    return Number(latest.seq ?? 0);
  }

  async appendUpdate(docId: string, update: Uint8Array, actorId: string, options: DocUpdateOptions = {}) {
    return db.transaction(tx => appendDocUpdate(tx, docId, update, actorId, options));
  }

  async createSnapshotAndCompactIfCurrent(
    docId: string,
    snapshot: Uint8Array,
    expectedDocVersion: number,
    expectedBaseSnapshotId: string | null,
    expectedBaseSeq: number,
    compactThroughSeq: number,
  ): Promise<'compacted' | 'stale' | 'not_found'> {
    if (snapshot.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
      throw new DocSyncTooLargeError(snapshot.byteLength);
    }

    return db.transaction(async (tx) => {
      const [doc] = await tx
        .select({ id: docs.id, version: docs.version })
        .from(docs)
        .where(eq(docs.id, docId))
        .for('update');
      if (!doc) {
        return 'not_found';
      }

      const currentBase = await getLatestSnapshot(tx, docId);
      if (
        doc.version !== expectedDocVersion
        || (currentBase?.id ?? null) !== expectedBaseSnapshotId
        || (currentBase?.seq ?? 0) !== expectedBaseSeq
      ) {
        return 'stale';
      }
      if (compactThroughSeq > expectedBaseSeq) {
        const [throughUpdate] = await tx
          .select({ seq: docCollabUpdates.seq })
          .from(docCollabUpdates)
          .where(and(eq(docCollabUpdates.docId, docId), eq(docCollabUpdates.seq, compactThroughSeq)))
          .limit(1);
        if (!throughUpdate) {
          return 'stale';
        }
      }

      const candidate = materializeDocHistory(snapshot, []);
      try { deriveValidatedDocBlocks(candidate); } finally { candidate.destroy(); }
      await tx.insert(docCollabSnapshots).values({
        docId,
        snapshot: Buffer.from(snapshot),
        seq: compactThroughSeq,
      });
      await tx.delete(docCollabUpdates).where(
        and(eq(docCollabUpdates.docId, docId), lte(docCollabUpdates.seq, compactThroughSeq)),
      );
      await deleteStaleSnapshots(tx, docId);
      return 'compacted';
    });
  }

  async persistCanonicalSnapshot(
    docId: string,
    snapshotBytes: Uint8Array,
    snapshotSeq: number,
    generation?: string,
  ): Promise<PersistCanonicalSnapshotResult> {
    return db.transaction(async (tx) => {
      const [doc] = await tx.select().from(docs).where(eq(docs.id, docId)).for('update');
      if (!doc) {
        return { status: 'not_found' };
      }
      if (generation !== undefined) assertDocGeneration(doc, generation);

      const base = await ensureBaseline(tx, doc);
      const currentSeq = await getDurableLatestSeq(tx, docId, base?.seq ?? 0);
      if (snapshotSeq !== currentSeq) {
        return { status: 'stale_seq', currentSeq };
      }
      if (snapshotBytes.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
        throw new DocSyncTooLargeError(snapshotBytes.byteLength);
      }

      const history = await loadBoundedHistory(tx, docId, base, snapshotSeq);
      if (history.hasMore || history.throughSeq !== snapshotSeq) {
        throw new DocSyncBusyError('Document history is too large to verify in one pass');
      }
      const durableDoc = materializeDocHistory(base?.snapshot ?? null, history.updates.map(({ update }) => update));
      try {
        const candidateDoc = materializeDocHistory(snapshotBytes, []);
        try {
          assertCurrentProjectionSupported(candidateDoc.getXmlFragment('prosemirror'));
          const candidateBlocks = deriveValidatedDocBlocks(candidateDoc);
          if (!docStatesEqual(candidateDoc, durableDoc)) {
            return { status: 'state_mismatch', currentSeq };
          }
          if (base?.seq !== snapshotSeq) {
            await checkpointDocHistory(tx, docId, Y.encodeStateAsUpdate(durableDoc), snapshotSeq);
          }
          const updated = await projectLockedDoc(tx, doc, candidateBlocks, snapshotSeq);
          return { status: 'persisted', doc: updated };
        } finally { candidateDoc.destroy(); }
      } finally { durableDoc.destroy(); }
    });
  }
}

export const docCollabRepository = new DocCollabRepository();
