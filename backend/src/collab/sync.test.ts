import { describe, expect, it, mock } from 'bun:test';
import * as Y from 'yjs';
import { buildDocSyncState, buildWhiteboardSyncState, MAX_COLLAB_SYNC_UPDATES } from './sync';
import { DocSyncBusyError, DocSyncTooLargeError, MAX_DOC_SYNC_PAYLOAD_BYTES } from './docHistory';

describe('collab sync helpers', () => {
  it('compacts large doc histories into a fresh snapshot', async () => {
    const doc = new Y.Doc();
    let singleUpdate: Uint8Array | null = null;

    doc.on('update', (update) => {
      singleUpdate = new Uint8Array(update);
    });

    doc.getMap('content').set('0', '0');

    const updates = Array.from({ length: MAX_COLLAB_SYNC_UPDATES }, (_, index) => ({
      seq: index + 1,
      update: new Uint8Array(singleUpdate as Uint8Array),
    }));
    const trailingUpdate = { seq: updates.length + 1, update: updates[0]!.update };

    let compactedSnapshot: Uint8Array | null = null;
    const createSnapshotAndCompactIfCurrent = mock(async (
      _docId: string,
      snapshot: Uint8Array,
    ) => {
      compactedSnapshot = snapshot;
      return 'compacted' as const;
    });

    const repository = {
      loadSyncState: async () => compactedSnapshot
        ? {
            snapshot: { seq: updates.length, snapshot: compactedSnapshot },
            updates: [trailingUpdate],
            latestSeq: trailingUpdate.seq,
            hasMore: false,
            docVersion: 1,
            canonicalSeq: updates.length,
            baseSnapshotId: 'snapshot-1',
            baseSeq: updates.length,
          }
        : {
            snapshot: null,
            updates,
            latestSeq: updates.length,
            hasMore: true,
            docVersion: 1,
            canonicalSeq: 0,
            baseSnapshotId: null,
            baseSeq: 0,
          },
      createSnapshotAndCompactIfCurrent,
    };

    const result = await buildDocSyncState(repository, 'doc-1');
    const restored = new Y.Doc();

    expect(result.snapshot).not.toBeNull();
    Y.applyUpdate(restored, result.snapshot as Uint8Array);
    expect(restored.getMap('content').toJSON()).toEqual(doc.getMap('content').toJSON());
    expect(result.updates).toHaveLength(1);
    Y.applyUpdate(restored, result.updates[0]!);
    expect(result.latestSeq).toBe(trailingUpdate.seq);
    expect(createSnapshotAndCompactIfCurrent).toHaveBeenCalledWith(
      'doc-1',
      expect.any(Uint8Array),
      1,
      null,
      0,
      updates.length,
    );
  });

  it('keeps the latest sequence when only a compacted doc snapshot remains', async () => {
    const result = await buildDocSyncState({
      loadSyncState: async () => ({
        snapshot: { seq: 12, snapshot: new Uint8Array() },
        updates: [],
        latestSeq: 12,
        hasMore: false,
        docVersion: 1,
        canonicalSeq: 12,
        baseSnapshotId: 'snapshot-1',
        baseSeq: 12,
      }),
      createSnapshotAndCompactIfCurrent: mock(async () => 'compacted' as const),
    }, 'doc-1');

    expect(result.latestSeq).toBe(12);
    expect(result.updates).toEqual([]);
  });

  it('retries compaction when another writer changes the durable base', async () => {
    const doc = new Y.Doc();
    let update: Uint8Array | null = null;
    doc.on('update', (value) => {
      update = new Uint8Array(value);
    });
    doc.getMap('content').set('key', 'value');

    const updates = Array.from({ length: MAX_COLLAB_SYNC_UPDATES }, (_, index) => ({
      seq: index + 1,
      update: new Uint8Array(update as Uint8Array),
    }));
    let compactionAttempts = 0;
    let compactedSnapshot: Uint8Array | null = null;
    const createSnapshotAndCompactIfCurrent = mock(async (
      _docId: string,
      snapshot: Uint8Array,
    ) => {
      compactionAttempts += 1;
      if (compactionAttempts === 1) {
        return 'stale' as const;
      }
      compactedSnapshot = snapshot;
      return 'compacted' as const;
    });
    const repository = {
      loadSyncState: async () => compactedSnapshot
        ? {
            snapshot: { seq: updates.length, snapshot: compactedSnapshot },
            updates: [],
            latestSeq: updates.length,
            hasMore: false,
            docVersion: 1,
            canonicalSeq: updates.length,
            baseSnapshotId: 'snapshot-1',
            baseSeq: updates.length,
          }
        : {
            snapshot: null,
            updates,
            latestSeq: updates.length,
            hasMore: true,
            docVersion: 1,
            canonicalSeq: 0,
            baseSnapshotId: null,
            baseSeq: 0,
          },
      createSnapshotAndCompactIfCurrent,
    };

    const result = await buildDocSyncState(repository, 'doc-1');

    expect(result.latestSeq).toBe(updates.length);
    expect(createSnapshotAndCompactIfCurrent).toHaveBeenCalledTimes(2);
  });

  it('stops after three stale compaction passes with a typed busy error', async () => {
    const source = new Y.Doc();
    source.getMap('content').set('key', 'value');
    const update = Y.encodeStateAsUpdate(source);
    const updates = Array.from({ length: MAX_COLLAB_SYNC_UPDATES }, (_, index) => ({
      seq: index + 1,
      update,
    }));
    const createSnapshotAndCompactIfCurrent = mock(async () => 'stale' as const);

    await expect(buildDocSyncState({
      loadSyncState: async () => ({
        snapshot: null,
        updates,
        latestSeq: updates.length,
        hasMore: true,
        docVersion: 1,
        canonicalSeq: 0,
        baseSnapshotId: null,
        baseSeq: 0,
      }),
      createSnapshotAndCompactIfCurrent,
    }, 'doc-1')).rejects.toBeInstanceOf(DocSyncBusyError);
    expect(createSnapshotAndCompactIfCurrent).toHaveBeenCalledTimes(3);
  });

  it('rejects generated compaction snapshots above the sync payload limit', async () => {
    const source = new Y.Doc();
    source.getMap('oversized').set('payload', 'x'.repeat(MAX_DOC_SYNC_PAYLOAD_BYTES + 1));
    const update = Y.encodeStateAsUpdate(source);
    expect(update.byteLength).toBeGreaterThan(MAX_DOC_SYNC_PAYLOAD_BYTES);
    const createSnapshotAndCompactIfCurrent = mock(async () => 'compacted' as const);

    await expect(buildDocSyncState({
      loadSyncState: async () => ({
        snapshot: null,
        updates: [{ seq: 1, update }],
        latestSeq: 1,
        hasMore: true,
        docVersion: 1,
        canonicalSeq: 0,
        baseSnapshotId: null,
        baseSeq: 0,
      }),
      createSnapshotAndCompactIfCurrent,
    }, 'doc-1')).rejects.toBeInstanceOf(DocSyncTooLargeError);
    expect(createSnapshotAndCompactIfCurrent).not.toHaveBeenCalled();
  });

  it('compacts large whiteboard histories into a fresh snapshot', async () => {
    const updates = Array.from({ length: MAX_COLLAB_SYNC_UPDATES + 1 }, (_, index) => ({
      seq: index + 1,
      update: {
        elements: [{ id: 'shape-1', version: index + 1 }],
        files: {},
      },
    }));
    const createSnapshot = mock(async () => undefined);
    const compactHistory = mock(async () => undefined);
    const persistState = mock(async () => undefined);

    const repository = {
      getLatestSnapshot: async () => null,
      getLatestSeq: async () => updates.length,
      countUpdatesInRange: async (_whiteboardId: string, minSeqExclusive: number, maxSeqInclusive: number) =>
        updates.filter((update) => update.seq > minSeqExclusive && update.seq <= maxSeqInclusive).length,
      getUpdatesInRange: async (
        _whiteboardId: string,
        minSeqExclusive: number,
        maxSeqInclusive: number,
        limit?: number
      ) => updates.filter((update) => update.seq > minSeqExclusive && update.seq <= maxSeqInclusive).slice(0, limit),
      createSnapshot,
      compactHistory,
    };

    const result = await buildWhiteboardSyncState(repository, { update: persistState }, 'whiteboard-1', {
      elements: [],
      files: {},
    });

    expect(result.updates).toHaveLength(0);
    expect(result.latestSeq).toBe(updates.length);
    expect(result.snapshot).toMatchObject({
      elements: [{ id: 'shape-1', version: updates.length }],
      files: {},
    });
    expect(createSnapshot).toHaveBeenCalledWith('whiteboard-1', result.snapshot, updates.length);
    expect(compactHistory).toHaveBeenCalledWith('whiteboard-1', updates.length);
    expect(persistState).toHaveBeenCalledWith('whiteboard-1', { data: result.snapshot });
  });

  it('preserves referenced files and resolves equal versions by version nonce', async () => {
    const updateCount = MAX_COLLAB_SYNC_UPDATES + 1;
    const updates = Array.from({ length: updateCount }, (_, index) => ({
      seq: index + 1,
      update: {
        elements: [{
          id: 'image-1',
          version: 1,
          versionNonce: index === updateCount - 1 ? 50 : 10,
          fileId: 'file-1',
        }],
        files: {},
      },
    }));
    const repository = {
      getLatestSnapshot: async () => null,
      getLatestSeq: async () => updates.length,
      countUpdatesInRange: async () => updates.length,
      getUpdatesInRange: async (
        _whiteboardId: string,
        minSeqExclusive: number,
        maxSeqInclusive: number,
        limit?: number
      ) => updates.filter((update) => update.seq > minSeqExclusive && update.seq <= maxSeqInclusive).slice(0, limit),
      createSnapshot: mock(async () => undefined),
      compactHistory: mock(async () => undefined),
    };

    const result = await buildWhiteboardSyncState(repository, { update: mock(async () => undefined) }, 'whiteboard-1', {
      elements: [{ id: 'image-1', version: 1, versionNonce: 100, fileId: 'file-1' }],
      files: { 'file-1': { id: 'file-1', dataURL: 'data:image/png;base64,AQID' } },
    });

    expect(result.snapshot).toEqual({
      elements: [{ id: 'image-1', version: 1, versionNonce: 100, fileId: 'file-1' }],
      files: { 'file-1': { id: 'file-1', dataURL: 'data:image/png;base64,AQID' } },
    });
  });
});
