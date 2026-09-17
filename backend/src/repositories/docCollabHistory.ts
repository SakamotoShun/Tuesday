import { and, asc, count, desc, eq, gt, inArray, lte, max, sql } from 'drizzle-orm';
import * as Y from 'yjs';
import { isDeepStrictEqual } from 'node:util';
import type { DbTransaction } from '../db/client';
import { docs, docCollabSnapshots, docCollabUpdates } from '../db/schema';
import {
  deriveValidatedDocBlocks, DocInvalidUpdateError, DocNotFoundError, DocSyncBusyError,
  DocSyncTooLargeError, materializeDocHistory, MAX_COLLAB_SYNC_UPDATES,
  MAX_DOC_SYNC_PAYLOAD_BYTES, MAX_DOC_UPDATE_BYTES,
} from '../collab/docHistory';
import { mergeOpaqueBlockMetadata, yDocFromBlocks } from '../collab/docContent';
import { extractSearchTextFromDocContent } from '../utils/doc-search';

const UPDATE_METADATA_LIMIT = MAX_COLLAB_SYNC_UPDATES + 1;
const SNAPSHOTS_TO_KEEP = 3;

export type LockedDoc = typeof docs.$inferSelect;
export type SnapshotRecord = { id: string; seq: number; snapshot: Uint8Array | Buffer };
export type BoundedHistory = {
  updates: Array<{ seq: number; update: Uint8Array | Buffer }>;
  throughSeq: number;
  hasMore: boolean;
  payloadBytes: number;
};

// Internal repository primitives: the caller owns the transaction and performs
// authorisation. Always lock the document before inspecting or changing history.
// Use READ COMMITTED so history queries after a lock wait see the prior commit.
export async function lockDoc(tx: DbTransaction, docId: string): Promise<LockedDoc> {
  const [doc] = await tx.select().from(docs).where(eq(docs.id, docId)).for('update');
  if (!doc) throw new DocNotFoundError();
  return doc;
}

export async function getLatestSnapshot(tx: DbTransaction, docId: string): Promise<SnapshotRecord | null> {
  return await tx.query.docCollabSnapshots.findFirst({
    where: eq(docCollabSnapshots.docId, docId),
    columns: { id: true, seq: true, snapshot: true },
    orderBy: [desc(docCollabSnapshots.seq), desc(docCollabSnapshots.createdAt)],
  }) ?? null;
}

export async function getDurableLatestSeq(tx: DbTransaction, docId: string, baseSeq: number): Promise<number> {
  const [latest] = await tx.select({ seq: max(docCollabUpdates.seq) }).from(docCollabUpdates)
    .where(eq(docCollabUpdates.docId, docId));
  return Math.max(baseSeq, Number(latest?.seq ?? 0));
}

/** A bounded prefix for sync/repair. A current read MUST reject hasMore. */
export async function loadBoundedHistory(
  tx: DbTransaction, docId: string, snapshot: SnapshotRecord | null, maxSeqInclusive?: number,
): Promise<BoundedHistory> {
  const baseSeq = snapshot?.seq ?? 0;
  const snapshotBytes = snapshot?.snapshot.byteLength ?? 0;
  if (snapshotBytes > MAX_DOC_SYNC_PAYLOAD_BYTES) throw new DocSyncTooLargeError(snapshotBytes);
  const range = maxSeqInclusive === undefined
    ? and(eq(docCollabUpdates.docId, docId), gt(docCollabUpdates.seq, baseSeq))
    : and(eq(docCollabUpdates.docId, docId), gt(docCollabUpdates.seq, baseSeq), lte(docCollabUpdates.seq, maxSeqInclusive));
  const metadata = await tx.select({
    id: docCollabUpdates.id, seq: docCollabUpdates.seq,
    size: sql<number>`octet_length(${docCollabUpdates.update})`,
  }).from(docCollabUpdates).where(range).orderBy(asc(docCollabUpdates.seq)).limit(UPDATE_METADATA_LIMIT);
  let payloadBytes = snapshotBytes;
  const selected: typeof metadata = [];
  for (const item of metadata) {
    const size = Number(item.size);
    if (size > MAX_DOC_UPDATE_BYTES) throw new DocSyncTooLargeError(size, MAX_DOC_UPDATE_BYTES);
    if (selected.length >= MAX_COLLAB_SYNC_UPDATES || payloadBytes + size > MAX_DOC_SYNC_PAYLOAD_BYTES) break;
    selected.push(item);
    payloadBytes += size;
  }
  if (metadata.length > 0 && selected.length === 0) {
    throw new DocSyncTooLargeError(snapshotBytes + Number(metadata[0]!.size));
  }
  const selectedIds = selected.map(item => item.id);
  const updates = selectedIds.length === 0 ? [] : await tx.query.docCollabUpdates.findMany({
    where: inArray(docCollabUpdates.id, selectedIds),
    columns: { seq: true, update: true }, orderBy: [asc(docCollabUpdates.seq)],
  });
  return { updates, throughSeq: updates.at(-1)?.seq ?? baseSeq, hasMore: metadata.length > selected.length, payloadBytes };
}

async function insertBaseline(tx: DbTransaction, doc: LockedDoc): Promise<SnapshotRecord> {
  let baselineDoc: Y.Doc;
  try { baselineDoc = yDocFromBlocks(doc.content); }
  catch (cause) { throw new DocInvalidUpdateError('Canonical document content cannot seed collaboration history', { cause }); }
  let snapshot: Uint8Array;
  try {
    try { deriveValidatedDocBlocks(baselineDoc); }
    catch (cause) { throw new DocInvalidUpdateError('Canonical document content cannot seed collaboration history', { cause }); }
    snapshot = Y.encodeStateAsUpdate(baselineDoc);
  } finally { baselineDoc.destroy(); }
  if (snapshot.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) throw new DocSyncTooLargeError(snapshot.byteLength);
  const [record] = await tx.insert(docCollabSnapshots)
    .values({ docId: doc.id, seq: 0, snapshot: Buffer.from(snapshot) })
    .returning({ id: docCollabSnapshots.id, seq: docCollabSnapshots.seq, snapshot: docCollabSnapshots.snapshot });
  if (!record) throw new Error('Failed to seed document collaboration baseline');
  if (doc.canonicalCollabSeq === null) {
    await tx.update(docs).set({ canonicalCollabSeq: 0 }).where(eq(docs.id, doc.id));
    doc.canonicalCollabSeq = 0;
  }
  return record;
}

export async function ensureBaseline(tx: DbTransaction, doc: LockedDoc): Promise<SnapshotRecord | null> {
  const snapshot = await getLatestSnapshot(tx, doc.id);
  if (snapshot) return snapshot;
  const [existingUpdates] = await tx.select({ count: count() }).from(docCollabUpdates)
    .where(eq(docCollabUpdates.docId, doc.id));
  // Never seed JSON over an existing history, even if its baseline is missing.
  return Number(existingUpdates?.count ?? 0) > 0 ? null : insertBaseline(tx, doc);
}

export async function deleteStaleSnapshots(tx: DbTransaction, docId: string): Promise<void> {
  const stale = await tx.query.docCollabSnapshots.findMany({
    where: eq(docCollabSnapshots.docId, docId), columns: { id: true },
    orderBy: [desc(docCollabSnapshots.seq), desc(docCollabSnapshots.createdAt)], offset: SNAPSHOTS_TO_KEEP,
  });
  if (stale.length) await tx.delete(docCollabSnapshots).where(inArray(docCollabSnapshots.id, stale.map(item => item.id)));
}

/** Write only bytes reconstructed from this transaction's locked history through throughSeq. */
export async function checkpointDocHistory(tx: DbTransaction, docId: string, state: Uint8Array, throughSeq: number) {
  if (state.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) throw new DocSyncTooLargeError(state.byteLength);
  await tx.insert(docCollabSnapshots).values({ docId, snapshot: Buffer.from(state), seq: throughSeq });
  await tx.delete(docCollabUpdates).where(and(eq(docCollabUpdates.docId, docId), lte(docCollabUpdates.seq, throughSeq)));
  await deleteStaleSnapshots(tx, docId);
}

export interface CurrentDocHistory {
  /** Stored metadata/version; canonical JSON may lag the separately returned content. */
  doc: LockedDoc;
  content: ReturnType<typeof mergeOpaqueBlockMetadata>;
  collabSeq: number;
  state: Uint8Array;
}

// Refuse known lossy forms rather than silently publishing a partial projection.
export function assertCurrentProjectionSupported(parent: Y.XmlFragment | Y.XmlElement): void {
  for (const child of parent.toArray()) {
    if (child instanceof Y.XmlText) {
      if (child.toDelta().some((part: { insert?: unknown }) => typeof part.insert !== 'string')) {
        throw new DocInvalidUpdateError('Current projection cannot represent embedded text values');
      }
    } else if (child instanceof Y.XmlElement) {
      if (['tableCell', 'tableHeader'].includes(child.nodeName) && child.length > 1) {
        throw new DocInvalidUpdateError('Current projection cannot represent multi-paragraph table cells');
      }
      assertCurrentProjectionSupported(child);
    }
  }
}

async function loadCurrentDocHistory(tx: DbTransaction, docId: string, checkpoint: boolean, repairPrefixes = false): Promise<CurrentDocHistory> {
  const doc = await lockDoc(tx, docId);
  let snapshot = await ensureBaseline(tx, doc);
  let history = await loadBoundedHistory(tx, docId, snapshot);
  // Older deployments may have exceeded the replay count before server checkpoints
  // existed. Repair bounded prefixes under the SAME transaction: never publish a
  // prefix as current, and roll all checkpoints back if the complete read fails.
  for (let attempt = 0; repairPrefixes && history.hasMore && attempt < 3; attempt++) {
    const prefix = materializeDocHistory(snapshot?.snapshot ?? null, history.updates.map(item => item.update));
    try { await checkpointDocHistory(tx, docId, Y.encodeStateAsUpdate(prefix), history.throughSeq); }
    finally { prefix.destroy(); }
    snapshot = await getLatestSnapshot(tx, docId);
    history = await loadBoundedHistory(tx, docId, snapshot);
  }
  if (history.hasMore) throw new DocSyncBusyError('Document history must be compacted before a complete current read');
  const ydoc = materializeDocHistory(snapshot?.snapshot ?? null, history.updates.map(item => item.update));
  try {
    const state = Y.encodeStateAsUpdate(ydoc);
    if (state.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) throw new DocSyncTooLargeError(state.byteLength);
    assertCurrentProjectionSupported(ydoc.getXmlFragment('prosemirror'));
    const blocks = deriveValidatedDocBlocks(ydoc);
    if (!Buffer.from(state).equals(Y.encodeStateAsUpdate(ydoc))) {
      throw new DocInvalidUpdateError('Current projection must not normalise collaboration history');
    }
    if (checkpoint && (snapshot === null || history.throughSeq > snapshot.seq)) {
      await checkpointDocHistory(tx, docId, state, history.throughSeq);
    }
    return { doc, content: mergeOpaqueBlockMetadata(blocks, doc.content), collabSeq: history.throughSeq, state };
  } finally { ydoc.destroy(); }
}

/** Internal current-read groundwork; does not persist projected JSON or a new version. */
export function readCurrentDocHistory(tx: DbTransaction, docId: string) {
  return loadCurrentDocHistory(tx, docId, false);
}

/** Same-history compaction; does not advance canonicalCollabSeq or docs.version. */
export function compactCurrentDocHistory(tx: DbTransaction, docId: string) {
  return loadCurrentDocHistory(tx, docId, true);
}

/** Project only the complete state protected by the caller's document lock. */
export async function projectLockedDoc(
  tx: DbTransaction, doc: LockedDoc, blocks: ReturnType<typeof deriveValidatedDocBlocks>, seq: number,
): Promise<LockedDoc> {
  const content = mergeOpaqueBlockMetadata(blocks, doc.content);
  const searchText = extractSearchTextFromDocContent(content);
  const changed = !isDeepStrictEqual(content, doc.content);
  if (!changed && doc.searchText === searchText && doc.canonicalCollabSeq === seq && !doc.collabProjectionPendingAt) return doc;
  const [updated] = await tx.update(docs).set({
    ...(changed ? { content, version: sql`${docs.version} + 1`, updatedAt: new Date() } : {}),
    ...(doc.searchText !== searchText ? { searchText } : {}),
    ...(doc.canonicalCollabSeq !== seq ? { canonicalCollabSeq: seq } : {}),
    ...(doc.collabProjectionPendingAt ? { collabProjectionPendingAt: null } : {}),
  }).where(eq(docs.id, doc.id)).returning();
  return updated!;
}

export async function projectCurrentDocHistory(tx: DbTransaction, docId: string): Promise<CurrentDocHistory> {
  const current = await loadCurrentDocHistory(tx, docId, false, true);
  current.doc = await projectLockedDoc(tx, current.doc, current.content, current.collabSeq);
  return current;
}
