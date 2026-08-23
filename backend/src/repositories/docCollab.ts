import { and, asc, count, desc, eq, gt, inArray, lte, max, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import * as Y from 'yjs';
import {
  applyAndValidateDocUpdate,
  deriveValidatedDocBlocks,
  docStatesEqual,
  DocInvalidUpdateError,
  DocNotFoundError,
  DocSyncBusyError,
  DocSyncTooLargeError,
  materializeDocHistory,
  MAX_COLLAB_SYNC_UPDATES,
  MAX_DOC_SYNC_PAYLOAD_BYTES,
  MAX_DOC_UPDATE_BYTES,
} from '../collab/docHistory';
import { mergeOpaqueBlockMetadata, yDocFromBlocks } from '../collab/docContent';
import { db } from '../db/client';
import { docs, docCollabSnapshots, docCollabUpdates } from '../db/schema';
import { extractSearchTextFromDocContent } from '../utils/doc-search';

const UPDATE_METADATA_LIMIT = MAX_COLLAB_SYNC_UPDATES + 1;
const SNAPSHOTS_TO_KEEP = 3;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LockedDoc = typeof docs.$inferSelect;

type SnapshotRecord = {
  id: string;
  seq: number;
  snapshot: Uint8Array | Buffer;
};

type BoundedHistory = {
  updates: Array<{ seq: number; update: Uint8Array | Buffer }>;
  throughSeq: number;
  hasMore: boolean;
  payloadBytes: number;
};

export type PersistCanonicalSnapshotResult =
  | { status: 'persisted'; doc: LockedDoc }
  | { status: 'stale_seq'; currentSeq: number }
  | { status: 'state_mismatch'; currentSeq: number }
  | { status: 'not_found' };

async function getLatestSnapshot(tx: Transaction, docId: string): Promise<SnapshotRecord | null> {
  return await tx.query.docCollabSnapshots.findFirst({
    where: eq(docCollabSnapshots.docId, docId),
    columns: { id: true, seq: true, snapshot: true },
    orderBy: [desc(docCollabSnapshots.seq), desc(docCollabSnapshots.createdAt)],
  }) ?? null;
}

async function getDurableLatestSeq(tx: Transaction, docId: string, baseSeq: number): Promise<number> {
  const [latest] = await tx
    .select({ seq: max(docCollabUpdates.seq) })
    .from(docCollabUpdates)
    .where(eq(docCollabUpdates.docId, docId));
  return Math.max(baseSeq, Number(latest?.seq ?? 0));
}

async function loadBoundedHistory(
  tx: Transaction,
  docId: string,
  snapshot: SnapshotRecord | null,
  maxSeqInclusive?: number,
): Promise<BoundedHistory> {
  const baseSeq = snapshot?.seq ?? 0;
  const snapshotBytes = snapshot?.snapshot.byteLength ?? 0;
  if (snapshotBytes > MAX_DOC_SYNC_PAYLOAD_BYTES) {
    throw new DocSyncTooLargeError(snapshotBytes);
  }

  const range = maxSeqInclusive === undefined
    ? and(eq(docCollabUpdates.docId, docId), gt(docCollabUpdates.seq, baseSeq))
    : and(
        eq(docCollabUpdates.docId, docId),
        gt(docCollabUpdates.seq, baseSeq),
        lte(docCollabUpdates.seq, maxSeqInclusive),
      );
  const metadata = await tx
    .select({
      id: docCollabUpdates.id,
      seq: docCollabUpdates.seq,
      size: sql<number>`octet_length(${docCollabUpdates.update})`,
    })
    .from(docCollabUpdates)
    .where(range)
    .orderBy(asc(docCollabUpdates.seq))
    .limit(UPDATE_METADATA_LIMIT);

  let payloadBytes = snapshotBytes;
  const selected: typeof metadata = [];
  for (const item of metadata) {
    const size = Number(item.size);
    if (size > MAX_DOC_UPDATE_BYTES) {
      throw new DocSyncTooLargeError(size, MAX_DOC_UPDATE_BYTES);
    }
    if (selected.length >= MAX_COLLAB_SYNC_UPDATES || payloadBytes + size > MAX_DOC_SYNC_PAYLOAD_BYTES) {
      break;
    }
    selected.push(item);
    payloadBytes += size;
  }

  if (metadata.length > 0 && selected.length === 0) {
    throw new DocSyncTooLargeError(snapshotBytes + Number(metadata[0]!.size));
  }

  const selectedIds = selected.map((item) => item.id);
  const updates = selectedIds.length === 0
    ? []
    : await tx.query.docCollabUpdates.findMany({
        where: inArray(docCollabUpdates.id, selectedIds),
        columns: { seq: true, update: true },
        orderBy: [asc(docCollabUpdates.seq)],
      });

  return {
    updates,
    throughSeq: updates[updates.length - 1]?.seq ?? baseSeq,
    hasMore: metadata.length > selected.length,
    payloadBytes,
  };
}

async function insertBaseline(tx: Transaction, doc: LockedDoc): Promise<SnapshotRecord> {
  let baselineDoc: Y.Doc;
  try {
    baselineDoc = yDocFromBlocks(doc.content);
    deriveValidatedDocBlocks(baselineDoc);
  } catch (cause) {
    throw new DocInvalidUpdateError('Canonical document content cannot seed collaboration history', { cause });
  }

  const snapshot = Y.encodeStateAsUpdate(baselineDoc);
  if (snapshot.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
    throw new DocSyncTooLargeError(snapshot.byteLength);
  }
  const [record] = await tx
    .insert(docCollabSnapshots)
    .values({ docId: doc.id, seq: 0, snapshot: Buffer.from(snapshot) })
    .returning({ id: docCollabSnapshots.id, seq: docCollabSnapshots.seq, snapshot: docCollabSnapshots.snapshot });
  if (!record) {
    throw new Error('Failed to seed document collaboration baseline');
  }

  if (doc.canonicalCollabSeq === null) {
    await tx.update(docs).set({ canonicalCollabSeq: 0 }).where(eq(docs.id, doc.id));
    doc.canonicalCollabSeq = 0;
  }
  return record;
}

async function ensureBaseline(tx: Transaction, doc: LockedDoc): Promise<SnapshotRecord | null> {
  const snapshot = await getLatestSnapshot(tx, doc.id);
  if (snapshot) {
    return snapshot;
  }
  const [existingUpdates] = await tx
    .select({ count: count() })
    .from(docCollabUpdates)
    .where(eq(docCollabUpdates.docId, doc.id));
  return Number(existingUpdates?.count ?? 0) > 0 ? null : insertBaseline(tx, doc);
}

async function deleteStaleSnapshots(tx: Transaction, docId: string): Promise<void> {
  const staleSnapshots = await tx.query.docCollabSnapshots.findMany({
    where: eq(docCollabSnapshots.docId, docId),
    columns: { id: true },
    orderBy: [desc(docCollabSnapshots.seq), desc(docCollabSnapshots.createdAt)],
    offset: SNAPSHOTS_TO_KEEP,
  });
  if (staleSnapshots.length > 0) {
    await tx.delete(docCollabSnapshots).where(inArray(docCollabSnapshots.id, staleSnapshots.map(({ id }) => id)));
  }
}

export class DocCollabRepository {
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
      const [doc] = await tx.select().from(docs).where(eq(docs.id, docId)).for('update');
      if (!doc) {
        throw new DocNotFoundError();
      }

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

  async appendUpdate(docId: string, update: Uint8Array, actorId: string) {
    return db.transaction(async (tx) => {
      const [doc] = await tx.select().from(docs).where(eq(docs.id, docId)).for('update');
      if (!doc) {
        throw new DocNotFoundError();
      }

      const snapshot = await ensureBaseline(tx, doc);
      const history = await loadBoundedHistory(tx, docId, snapshot);
      if (history.hasMore) {
        throw new DocSyncBusyError('Document history must be compacted before accepting updates');
      }
      applyAndValidateDocUpdate(snapshot?.snapshot ?? null, history.updates.map(({ update }) => update), update);

      if (history.payloadBytes + update.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
        const durableDoc = materializeDocHistory(
          snapshot?.snapshot ?? null,
          history.updates.map(({ update }) => update),
        );
        deriveValidatedDocBlocks(durableDoc);
        const compactedSnapshot = Y.encodeStateAsUpdate(durableDoc);
        if (compactedSnapshot.byteLength + update.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
          throw new DocSyncTooLargeError(compactedSnapshot.byteLength + update.byteLength);
        }

        if (history.throughSeq > (snapshot?.seq ?? 0)) {
          await tx.insert(docCollabSnapshots).values({
            docId,
            snapshot: Buffer.from(compactedSnapshot),
            seq: history.throughSeq,
          });
          await tx.delete(docCollabUpdates).where(
            and(eq(docCollabUpdates.docId, docId), lte(docCollabUpdates.seq, history.throughSeq)),
          );
          await deleteStaleSnapshots(tx, docId);
        }
      }

      const [result] = await tx
        .insert(docCollabUpdates)
        .values({ docId, update: Buffer.from(update), actorId })
        .returning({ seq: docCollabUpdates.seq });
      if (!result) {
        throw new Error('Failed to append document update');
      }
      return result.seq;
    });
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

      deriveValidatedDocBlocks(materializeDocHistory(snapshot, []));
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
  ): Promise<PersistCanonicalSnapshotResult> {
    return db.transaction(async (tx) => {
      const [doc] = await tx.select().from(docs).where(eq(docs.id, docId)).for('update');
      if (!doc) {
        return { status: 'not_found' };
      }

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
      const candidateDoc = materializeDocHistory(snapshotBytes, []);
      const candidateBlocks = deriveValidatedDocBlocks(candidateDoc);
      if (!docStatesEqual(candidateDoc, durableDoc)) {
        return { status: 'state_mismatch', currentSeq };
      }

      if (doc.canonicalCollabSeq !== null && doc.canonicalCollabSeq >= snapshotSeq) {
        return { status: 'persisted', doc };
      }

      const content = mergeOpaqueBlockMetadata(candidateBlocks, doc.content);
      if (base?.seq !== snapshotSeq || !docStatesEqual(candidateDoc, materializeDocHistory(base.snapshot, []))) {
        await tx.insert(docCollabSnapshots).values({
          docId,
          snapshot: Buffer.from(snapshotBytes),
          seq: snapshotSeq,
        });
      }

      const contentChanged = !isDeepStrictEqual(content, doc.content);
      const [updated] = await tx
        .update(docs)
        .set({
          content,
          searchText: extractSearchTextFromDocContent(content),
          canonicalCollabSeq: snapshotSeq,
          ...(contentChanged ? { updatedAt: new Date(), version: sql`${docs.version} + 1` } : {}),
        })
        .where(eq(docs.id, docId))
        .returning();

      await tx.delete(docCollabUpdates).where(
        and(eq(docCollabUpdates.docId, docId), lte(docCollabUpdates.seq, snapshotSeq)),
      );
      await deleteStaleSnapshots(tx, docId);
      return updated ? { status: 'persisted', doc: updated } : { status: 'not_found' };
    });
  }
}

export const docCollabRepository = new DocCollabRepository();
