import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;
let db: typeof import('../db/client').db;
let tables: typeof import('../db/schema');
let orm: typeof import('drizzle-orm');
let fixtures: typeof import('../test/integration');
let repository: typeof import('./docCollab');
let history: typeof import('./docCollabHistory');
let errors: typeof import('../collab/docHistory');
let userId: string;

if (runIntegration) {
  ({ db } = await import('../db/client'));
  tables = await import('../db/schema');
  orm = await import('drizzle-orm');
  fixtures = await import('../test/integration');
  repository = await import('./docCollab');
  history = await import('./docCollabHistory');
  errors = await import('../collab/docHistory');
}

function materialize(state: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

function textIn(doc: Y.Doc, blockId = 'phrase'): Y.XmlText {
  const group = doc.getXmlFragment('prosemirror').get(0) as Y.XmlElement;
  const container = group.toArray().find(node => node instanceof Y.XmlElement && node.getAttribute('id') === blockId) as Y.XmlElement;
  return (container.get(0) as Y.XmlElement).get(0) as Y.XmlText;
}

function edit(doc: Y.Doc, operation: () => void) {
  const vector = Y.encodeStateVector(doc);
  doc.transact(operation);
  return Y.encodeStateAsUpdate(doc, vector);
}

async function fixture() {
  const stored = await fixtures.seedDoc(null, userId, { content: [
    { id: 'phrase', type: 'paragraph', props: { customProp: 'keep' }, customTop: 'keep',
      content: [{ type: 'text', text: 'before TARGET after', styles: {} }], children: [] },
    { id: 'outside', type: 'paragraph', props: {},
      content: [{ type: 'text', text: 'outside', styles: { bold: true } }], children: [] },
  ] });
  const state = await repository.docCollabRepository.loadSyncState(stored.id);
  if (!state.snapshot) throw new Error('Expected seeded baseline');
  return { stored, ydoc: materialize(state.snapshot.snapshot) };
}

async function records(docId: string) {
  const { docs, docCollabSnapshots, docCollabUpdates } = tables;
  return {
    doc: await db.query.docs.findFirst({ where: orm.eq(docs.id, docId) }),
    snapshots: await db.select().from(docCollabSnapshots).where(orm.eq(docCollabSnapshots.docId, docId)).orderBy(orm.asc(docCollabSnapshots.seq)),
    updates: await db.select().from(docCollabUpdates).where(orm.eq(docCollabUpdates.docId, docId)).orderBy(orm.asc(docCollabUpdates.seq)),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function expectBlocked(pid: number) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await db.execute(orm.sql`select cardinality(pg_blocking_pids(${pid})) as blockers`);
    if (Number(rows[0]?.blockers) > 0) return;
    await Bun.sleep(10);
  }
  throw new Error('Expected PostgreSQL to report a blocked transaction');
}

describeIntegration('Milestone 2A transaction-scoped collaboration history', () => {
  beforeAll(async () => {
    await fixtures.ensureIntegrationDb();
    userId = (await fixtures.seedUser()).id;
  });

  afterAll(async () => {
    if (!userId) return;
    await db.delete(tables.docs).where(orm.eq(tables.docs.createdBy, userId));
    await db.delete(tables.users).where(orm.eq(tables.users.id, userId));
  });

  it('reads an acknowledged update while stored JSON/version remain behind', async () => {
    const { stored, ydoc } = await fixture();
    try {
      const update = edit(ydoc, () => textIn(ydoc).insert(7, 'human '));
      const seq = await repository.docCollabRepository.appendUpdate(stored.id, update, userId);
      const before = await records(stored.id);
      const current = await repository.docCollabRepository.readCurrent(stored.id);
      expect(current.collabSeq).toBe(seq);
      expect(current.content[0]).toMatchObject({
        id: 'phrase', props: { customProp: 'keep' }, customTop: 'keep',
        content: [{ type: 'text', text: 'before human TARGET after', styles: {} }],
      });
      expect(current.content[1]).toMatchObject({ content: [{ type: 'text', text: 'outside', styles: { bold: true } }] });
      expect(Buffer.from(current.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
      expect(current.doc.version).toBe(stored.version);
      expect(current.doc.canonicalCollabSeq).toBe(0);
      expect(current.doc.content).toEqual(stored.content);
      expect(await records(stored.id)).toEqual(before);
    } finally { ydoc.destroy(); }
  });

  it('preserves deletion coverage and original anchors across checkpoints and late updates', async () => {
    const { stored, ydoc } = await fixture();
    const offline = materialize(Y.encodeStateAsUpdate(ydoc));
    try {
      const anchors = [0, 6, 13, 18].map(index => Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(textIn(ydoc), index)));
      const container = Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(textIn(ydoc), 0, -1));
      const late = edit(offline, () => textIn(offline, 'outside').insert(3, ' late '));
      const vector = Y.encodeStateVector(ydoc);
      const deletion = edit(ydoc, () => textIn(ydoc).delete(7, 6));
      expect(Y.encodeStateVector(ydoc)).toEqual(vector); // Equal vectors do not mean equal deletion coverage.
      const seq = await repository.docCollabRepository.appendUpdate(stored.id, deletion, userId);
      const compacted = await repository.docCollabRepository.compactCurrent(stored.id);
      expect(compacted.collabSeq).toBe(seq);
      expect(Buffer.from(compacted.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
      const reloaded = materialize(compacted.state);
      try {
        expect(textIn(reloaded).toString()).toBe('before  after');
        expect(anchors.map(anchor => Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(anchor), reloaded, false)?.index))
          .toEqual([0, 6, 7, 12]);
        expect(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(textIn(reloaded), 0, -1))).toEqual(container);
      } finally { reloaded.destroy(); }
      const after = await records(stored.id);
      expect(after.updates).toHaveLength(0);
      expect(after.doc?.version).toBe(stored.version);
      expect(after.doc?.canonicalCollabSeq).toBe(0);
      await repository.docCollabRepository.compactCurrent(stored.id);
      expect(await records(stored.id)).toEqual(after); // No duplicate checkpoint on no-op compaction.
      await repository.docCollabRepository.appendUpdate(stored.id, late, userId);
      Y.applyUpdate(ydoc, late);
      expect(Buffer.from((await repository.docCollabRepository.readCurrent(stored.id)).state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
    } finally { ydoc.destroy(); offline.destroy(); }
  });

  it('keeps only three checkpoints over repeated same-history compaction', async () => {
    const { stored, ydoc } = await fixture();
    try {
      for (let index = 0; index < 5; index++) {
        await repository.docCollabRepository.appendUpdate(stored.id, edit(ydoc, () => textIn(ydoc).insert(0, String(index))), userId);
        const current = await repository.docCollabRepository.compactCurrent(stored.id);
        expect(Buffer.from(current.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
      }
      const after = await records(stored.id);
      expect(after.snapshots).toHaveLength(3);
      expect(after.updates).toHaveLength(0);
      expect(after.doc?.version).toBe(stored.version);
      expect(after.doc?.content).toEqual(stored.content);
    } finally { ydoc.destroy(); }
  });

  it('rolls back composed append, checkpoint and metadata writes in the outer transaction', async () => {
    const { stored, ydoc } = await fixture();
    try {
      const before = await records(stored.id);
      const update = edit(ydoc, () => textIn(ydoc).insert(0, 'rollback '));
      await expect(db.transaction(async tx => {
        const seq = await repository.appendDocUpdate(tx, stored.id, update, userId);
        await tx.update(tables.docs).set({ title: 'also rolled back' }).where(orm.eq(tables.docs.id, stored.id));
        expect((await history.readCurrentDocHistory(tx, stored.id)).collabSeq).toBe(seq);
        await history.compactCurrentDocHistory(tx, stored.id);
        throw new Error('injected failure after checkpoint');
      })).rejects.toThrow('injected failure after checkpoint');
      expect(await records(stored.id)).toEqual(before);
      await repository.docCollabRepository.appendUpdate(stored.id, update, userId);
      expect(Buffer.from((await repository.docCollabRepository.readCurrent(stored.id)).state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
    } finally { ydoc.destroy(); }
  });

  it('rolls back on a real SQL constraint failure after append and checkpoint', async () => {
    const { stored, ydoc } = await fixture();
    try {
      const before = await records(stored.id);
      const update = edit(ydoc, () => textIn(ydoc).insert(0, 'rollback '));
      await expect(db.transaction(async tx => {
        await repository.appendDocUpdate(tx, stored.id, update, userId);
        await history.compactCurrentDocHistory(tx, stored.id);
        await tx.insert(tables.docCollabUpdates).values({ docId: stored.id, actorId: randomUUID(), update: Buffer.from(update) });
      })).rejects.toMatchObject({ cause: { code: '23503' } });
      expect(await records(stored.id)).toEqual(before);
    } finally { ydoc.destroy(); }
  });

  it('waits for an in-flight writer and reads its commit on the same document', async () => {
    const { stored, ydoc } = await fixture();
    const writerReady = deferred<void>();
    const release = deferred<void>();
    const readerReady = deferred<number>();
    const update = edit(ydoc, () => textIn(ydoc).insert(0, 'committed '));
    const writer = db.transaction(async tx => {
      const seq = await repository.appendDocUpdate(tx, stored.id, update, userId);
      writerReady.resolve();
      await release.promise;
      return seq;
    });
    let reader: ReturnType<typeof repository.docCollabRepository.readCurrent> | undefined;
    try {
      await writerReady.promise;
      reader = db.transaction(async tx => {
        const rows = await tx.execute(orm.sql`select pg_backend_pid() as pid`);
        readerReady.resolve(Number(rows[0]!.pid));
        return history.readCurrentDocHistory(tx, stored.id);
      });
      await expectBlocked(await readerReady.promise);
      release.resolve();
      const [seq, current] = await Promise.all([writer, reader]);
      expect(current.collabSeq).toBe(seq);
      expect(Buffer.from(current.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
    } finally { release.resolve(); await Promise.allSettled([writer, reader]); ydoc.destroy(); }
  }, 15_000);

  it('serialises a checkpoint with a later append while another document remains writable', async () => {
    const first = await fixture();
    const other = await fixture();
    const checkpointReady = deferred<void>();
    const release = deferred<void>();
    const writerReady = deferred<number>();
    await repository.docCollabRepository.appendUpdate(first.stored.id, edit(first.ydoc, () => textIn(first.ydoc).insert(0, 'first ')), userId);
    const checkpoint = db.transaction(async tx => {
      const result = await history.compactCurrentDocHistory(tx, first.stored.id);
      checkpointReady.resolve();
      await release.promise;
      return result;
    });
    let writer: Promise<number> | undefined;
    try {
      await checkpointReady.promise;
      const next = edit(first.ydoc, () => textIn(first.ydoc).insert(0, 'second '));
      writer = db.transaction(async tx => {
        const rows = await tx.execute(orm.sql`select pg_backend_pid() as pid`);
        writerReady.resolve(Number(rows[0]!.pid));
        return repository.appendDocUpdate(tx, first.stored.id, next, userId);
      });
      await expectBlocked(await writerReady.promise);
      await db.transaction(async tx => {
        await tx.execute(orm.sql`set local lock_timeout = '500ms'`);
        await repository.appendDocUpdate(tx, other.stored.id, edit(other.ydoc, () => textIn(other.ydoc).insert(0, 'independent ')), userId);
      });
      release.resolve();
      const [base, seq] = await Promise.all([checkpoint, writer]);
      expect(seq).toBeGreaterThan(base.collabSeq);
      const current = await repository.docCollabRepository.readCurrent(first.stored.id);
      expect(current.collabSeq).toBe(seq);
      expect(Buffer.from(current.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(first.ydoc)));
      expect((await records(first.stored.id)).updates.map(row => row.seq)).toEqual([seq]);
    } finally { release.resolve(); await Promise.allSettled([checkpoint, writer]); first.ydoc.destroy(); other.ydoc.destroy(); }
  }, 15_000);

  it('merges concurrent independent updates from the same baseline', async () => {
    const { stored, ydoc } = await fixture();
    const second = materialize(Y.encodeStateAsUpdate(ydoc));
    try {
      const a = edit(ydoc, () => textIn(ydoc).insert(7, 'A'));
      const b = edit(second, () => textIn(second).insert(7, 'B'));
      const seqs = await Promise.all([a, b].map(update => repository.docCollabRepository.appendUpdate(stored.id, update, userId)));
      Y.applyUpdate(ydoc, b);
      const current = await repository.docCollabRepository.readCurrent(stored.id);
      expect(current.collabSeq).toBe(Math.max(...seqs));
      expect(Buffer.from(current.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
    } finally { ydoc.destroy(); second.destroy(); }
  });

  it('reads update-only legacy history without seeding stale JSON over it', async () => {
    const { stored, ydoc } = await fixture();
    try {
      await db.delete(tables.docCollabSnapshots).where(orm.eq(tables.docCollabSnapshots.docId, stored.id));
      textIn(ydoc).insert(0, 'legacy ');
      const [row] = await db.insert(tables.docCollabUpdates).values({ docId: stored.id, actorId: userId, update: Buffer.from(Y.encodeStateAsUpdate(ydoc)) }).returning();
      const read = await repository.docCollabRepository.readCurrent(stored.id);
      expect(read.collabSeq).toBe(row!.seq);
      expect((await records(stored.id)).snapshots).toHaveLength(0);
      expect(Buffer.from((await repository.docCollabRepository.compactCurrent(stored.id)).state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(ydoc)));
      expect((await records(stored.id)).snapshots).toHaveLength(1);
    } finally { ydoc.destroy(); }
  });

  it('refuses a prefix-only read or checkpoint above the 200-update replay limit', async () => {
    const { stored, ydoc } = await fixture();
    try {
      await db.insert(tables.docCollabUpdates).values(Array.from({ length: 200 }, () => ({
        docId: stored.id, actorId: userId, update: Buffer.from([0, 0]),
      })));
      await repository.docCollabRepository.readCurrent(stored.id); // Exact limit remains readable.
      await db.insert(tables.docCollabUpdates).values({ docId: stored.id, actorId: userId, update: Buffer.from([0, 0]) });
      const before = await records(stored.id);
      await expect(repository.docCollabRepository.readCurrent(stored.id)).rejects.toBeInstanceOf(errors.DocSyncBusyError);
      await expect(repository.docCollabRepository.compactCurrent(stored.id)).rejects.toBeInstanceOf(errors.DocSyncBusyError);
      expect(await records(stored.id)).toEqual(before);
    } finally { ydoc.destroy(); }
  });

  it('refuses a byte-bounded prefix and enforces update/snapshot size limits', async () => {
    const { stored, ydoc } = await fixture();
    try {
      const updates = Array.from({ length: 3 }, (_, index) => edit(ydoc, () => ydoc.getMap('auxiliary').set(String(index), 'x'.repeat(800_000))));
      await db.insert(tables.docCollabUpdates).values(updates.map(update => ({ docId: stored.id, actorId: userId, update: Buffer.from(update) })));
      const before = await records(stored.id);
      await expect(repository.docCollabRepository.readCurrent(stored.id)).rejects.toBeInstanceOf(errors.DocSyncBusyError);
      expect(await records(stored.id)).toEqual(before);
      await db.delete(tables.docCollabUpdates).where(orm.eq(tables.docCollabUpdates.docId, stored.id));
      const oversized = Buffer.alloc(errors.MAX_DOC_UPDATE_BYTES + 1);
      await expect(repository.docCollabRepository.appendUpdate(stored.id, oversized, userId)).rejects.toBeInstanceOf(errors.DocUpdateTooLargeError);
      await expect(db.insert(tables.docCollabUpdates).values({ docId: stored.id, actorId: userId, update: oversized }).execute())
        .rejects.toMatchObject({ cause: { code: '23514', constraint_name: 'doc_collab_updates_update_size_check' } });
      await db.update(tables.docCollabSnapshots).set({ snapshot: Buffer.alloc(errors.MAX_DOC_SYNC_PAYLOAD_BYTES + 1) })
        .where(orm.eq(tables.docCollabSnapshots.docId, stored.id));
      await expect(repository.docCollabRepository.readCurrent(stored.id)).rejects.toBeInstanceOf(errors.DocSyncTooLargeError);
    } finally { ydoc.destroy(); }
  });

  it('rejects corrupt and unresolved history without falling back to JSON', async () => {
    const { stored, ydoc } = await fixture();
    try {
      edit(ydoc, () => textIn(ydoc).insert(0, 'missing '));
      const dependent = edit(ydoc, () => textIn(ydoc).insert(1, 'dependent '));
      await db.insert(tables.docCollabUpdates).values({ docId: stored.id, actorId: userId, update: Buffer.from(dependent) });
      const before = await records(stored.id);
      await expect(repository.docCollabRepository.readCurrent(stored.id)).rejects.toBeInstanceOf(errors.DocInvalidUpdateError);
      await expect(repository.docCollabRepository.compactCurrent(stored.id)).rejects.toBeInstanceOf(errors.DocInvalidUpdateError);
      expect(await records(stored.id)).toEqual(before);
      await db.delete(tables.docCollabUpdates).where(orm.eq(tables.docCollabUpdates.docId, stored.id));
      await db.update(tables.docCollabSnapshots).set({ snapshot: Buffer.from([255]) }).where(orm.eq(tables.docCollabSnapshots.docId, stored.id));
      await expect(repository.docCollabRepository.readCurrent(stored.id)).rejects.toBeInstanceOf(errors.DocInvalidUpdateError);
    } finally { ydoc.destroy(); }
  });

  it('rolls back baseline seeding on invalid append and reports missing documents', async () => {
    const doc = await fixtures.seedDoc(null, userId);
    const before = await records(doc.id);
    await expect(repository.docCollabRepository.appendUpdate(doc.id, Uint8Array.of(255), userId)).rejects.toBeInstanceOf(errors.DocInvalidUpdateError);
    expect(await records(doc.id)).toEqual(before);
    await expect(repository.docCollabRepository.readCurrent(randomUUID())).rejects.toBeInstanceOf(errors.DocNotFoundError);
    await expect(repository.docCollabRepository.compactCurrent(randomUUID())).rejects.toBeInstanceOf(errors.DocNotFoundError);
  });

  it('refuses unsupported embedded text rather than returning a coerced current projection', async () => {
    const { stored, ydoc } = await fixture();
    try {
      const update = edit(ydoc, () => textIn(ydoc, 'outside').insertEmbed(3, { kind: 'unsupported' }));
      await repository.docCollabRepository.appendUpdate(stored.id, update, userId);
      const before = await records(stored.id);
      await expect(repository.docCollabRepository.readCurrent(stored.id)).rejects.toThrow('embedded text values');
      await expect(repository.docCollabRepository.compactCurrent(stored.id)).rejects.toThrow('embedded text values');
      expect(await records(stored.id)).toEqual(before);
    } finally { ydoc.destroy(); }
  });

  it.each([false, true])('refuses lossy multi-paragraph table projection (header: %s)', async header => {
    const stored = await fixtures.seedDoc(null, userId, { content: [{
      id: 'table', type: 'table', props: {}, children: [], content: {
        type: 'tableContent', ...(header ? { headerRows: 1 } : {}), rows: [{ cells: [
          [{ type: 'text', text: 'A', styles: {} }],
          [{ type: 'text', text: 'B', styles: { bold: true } }],
        ] }],
      },
    }] });
    const baseline = await repository.docCollabRepository.loadSyncState(stored.id);
    const ydoc = materialize(baseline.snapshot!.snapshot);
    try {
      const cells: Y.XmlElement[] = [];
      const visit = (parent: Y.XmlFragment | Y.XmlElement) => {
        for (const node of parent.toArray()) {
          if (!(node instanceof Y.XmlElement)) continue;
          if (node.nodeName === (header ? 'tableHeader' : 'tableCell')) cells.push(node);
          visit(node);
        }
      };
      visit(ydoc.getXmlFragment('prosemirror'));
      expect(cells).toHaveLength(2);
      const update = edit(ydoc, () => cells[0]!.push([(cells[1]!.get(0) as Y.XmlElement).clone()]));
      await repository.docCollabRepository.appendUpdate(stored.id, update, userId);
      const before = await records(stored.id);
      await expect(repository.docCollabRepository.readCurrent(stored.id)).rejects.toThrow('multi-paragraph table cells');
      await expect(repository.docCollabRepository.compactCurrent(stored.id)).rejects.toThrow('multi-paragraph table cells');
      expect(await records(stored.id)).toEqual(before);
    } finally { ydoc.destroy(); }
  });
});
