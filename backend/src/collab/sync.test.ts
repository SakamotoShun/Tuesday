import { describe, expect, it, mock } from 'bun:test';
import * as Y from 'yjs';
import { buildDocSyncState, buildWhiteboardSyncState, MAX_COLLAB_SYNC_UPDATES } from './sync';

describe('collab sync helpers', () => {
  it('compacts large doc histories into a fresh snapshot', async () => {
    const doc = new Y.Doc();
    let singleUpdate: Uint8Array | null = null;

    doc.on('update', (update) => {
      singleUpdate = new Uint8Array(update);
    });

    doc.getMap('content').set('0', '0');

    const updates = Array.from({ length: MAX_COLLAB_SYNC_UPDATES + 1 }, (_, index) => ({
      seq: index + 1,
      update: new Uint8Array(singleUpdate as Uint8Array),
    }));

    const createSnapshot = mock(async () => undefined);
    const compactHistory = mock(async () => undefined);

    const repository = {
      getLatestSnapshot: async () => null,
      getLatestSeq: async () => updates.length,
      countUpdatesInRange: async (_docId: string, minSeqExclusive: number, maxSeqInclusive: number) =>
        updates.filter((update) => update.seq > minSeqExclusive && update.seq <= maxSeqInclusive).length,
      getUpdatesInRange: async (_docId: string, minSeqExclusive: number, maxSeqInclusive: number, limit?: number) =>
        updates
          .filter((update) => update.seq > minSeqExclusive && update.seq <= maxSeqInclusive)
          .slice(0, limit),
      createSnapshot,
      compactHistory,
    };

    const result = await buildDocSyncState(repository, 'doc-1');
    const restored = new Y.Doc();

    expect(result.snapshot).not.toBeNull();
    Y.applyUpdate(restored, result.snapshot as Uint8Array);
    expect(restored.getMap('content').toJSON()).toEqual(doc.getMap('content').toJSON());
    expect(result.updates).toHaveLength(0);
    expect(result.latestSeq).toBe(updates.length);
    expect(createSnapshot).toHaveBeenCalledWith('doc-1', expect.any(Uint8Array), updates.length);
    expect(compactHistory).toHaveBeenCalledWith('doc-1', updates.length);
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
});
