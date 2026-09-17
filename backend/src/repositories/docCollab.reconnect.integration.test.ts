import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as Y from 'yjs';

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const suite = enabled ? describe : describe.skip;
let db: typeof import('../db/client').db;
let tables: typeof import('../db/schema');
let orm: typeof import('drizzle-orm');
let fixtures: typeof import('../test/integration');
let repository: typeof import('./docCollab').docCollabRepository;
let userId: string;

if (enabled) {
  ({ db } = await import('../db/client'));
  tables = await import('../db/schema');
  orm = await import('drizzle-orm');
  fixtures = await import('../test/integration');
  ({ docCollabRepository: repository } = await import('./docCollab'));
}

async function fixture() {
  const stored = await fixtures.seedDoc(null, userId, { content: [
    { id: 'phrase', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'start', styles: {} }], children: [] },
    { id: 'outside', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'outside', styles: { bold: true } }], children: [] },
  ] });
  const sync = await repository.loadSyncState(stored.id);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, sync.snapshot!.snapshot);
  return { id: stored.id, doc, generation: stored.collabGeneration };
}

function textIn(doc: Y.Doc) {
  const group = doc.getXmlFragment('prosemirror').get(0) as Y.XmlElement;
  const block = group.toArray().find((node) => node instanceof Y.XmlElement && node.getAttribute('id') === 'phrase') as Y.XmlElement;
  return (block.get(0) as Y.XmlElement).get(0) as Y.XmlText;
}

function expectContent(content: unknown, text: string) {
  expect(content).toMatchObject([
    { id: 'phrase', content: [{ type: 'text', text, styles: {} }] },
    { id: 'outside', content: [{ type: 'text', text: 'outside', styles: { bold: true } }] },
  ]);
}

function edit(doc: Y.Doc, operation: () => void) {
  const vector = Y.encodeStateVector(doc);
  doc.transact(operation);
  return Y.encodeStateAsUpdate(doc, vector);
}

suite('Document reconnect checkpoint boundaries', () => {
  beforeAll(async () => {
    await fixtures.ensureIntegrationDb();
    userId = (await fixtures.seedUser()).id;
  });
  afterAll(async () => {
    if (!userId) return;
    await db.delete(tables.docs).where(orm.eq(tables.docs.createdBy, userId));
    await db.delete(tables.users).where(orm.eq(tables.users.id, userId));
  });

  it('replays a lost ACK exactly once after compaction and later writes, with author/content binding', async () => {
    const { id, doc, generation } = await fixture();
    try {
      const operationId = crypto.randomUUID();
      const update = edit(doc, () => textIn(doc).insert(0, 'first '));
      const options = { generation, operationId };
      const [first, duplicate] = await Promise.all([
        repository.appendUpdate(id, update, userId, options), repository.appendUpdate(id, update, userId, options),
      ]);
      expect(duplicate).toBe(first);
      await repository.compactCurrent(id);
      const next = edit(doc, () => textIn(doc).insert(0, 'second '));
      const latest = await repository.appendUpdate(id, next, userId, { generation, operationId: crypto.randomUUID() });
      const before = await repository.projectCurrent(id);
      const receipt = await db.select().from(tables.docCollabOperations).where(orm.eq(tables.docCollabOperations.docId, id));
      expect(receipt).toHaveLength(2);
      expect(await repository.appendUpdate(id, update, userId, options)).toBe(first);
      expect(await repository.getLatestSeq(id)).toBe(latest);
      await expect(repository.appendUpdate(id, next, userId, options)).rejects.toThrow('reused');
      await expect(repository.appendUpdate(id, update, crypto.randomUUID(), options)).rejects.toThrow('reused');
      const after = await repository.projectCurrent(id);
      expect(after).toEqual(before);
      expectContent(after.content, 'second first start');
      expect(await db.select().from(tables.docCollabOperations).where(orm.eq(tables.docCollabOperations.docId, id))).toEqual(receipt);
      const { docRepository } = await import('./doc');
      const reset = await docRepository.updateContentAndResetCollab(id, { content: [] });
      expect(reset!.collabGeneration).not.toBe(generation);
      expect(await db.select().from(tables.docCollabOperations).where(orm.eq(tables.docCollabOperations.docId, id))).toHaveLength(0);
      await expect(repository.appendUpdate(id, update, userId, options)).rejects.toThrow();
      expect(await repository.getLatestSeq(id)).toBe(0);
    } finally { doc.destroy(); }
  });

  it('rolls back operation receipts together with accepted content', async () => {
    const { id, doc, generation } = await fixture();
    try {
      const { appendDocUpdate } = await import('./docCollab');
      const update = edit(doc, () => textIn(doc).insert(0, 'retry '));
      const options = { generation, operationId: crypto.randomUUID() };
      await expect(db.transaction(async tx => {
        await appendDocUpdate(tx, id, update, userId, options);
        throw new Error('receipt transaction failure');
      })).rejects.toThrow('receipt transaction failure');
      expect(await repository.getLatestSeq(id)).toBe(0);
      expect(await db.select().from(tables.docCollabOperations).where(orm.eq(tables.docCollabOperations.docId, id))).toHaveLength(0);
      await repository.appendUpdate(id, update, userId, options);
      expectContent((await repository.readCurrent(id)).content, 'retry start');
      expect(await db.select().from(tables.docCollabOperations).where(orm.eq(tables.docCollabOperations.docId, id))).toHaveLength(1);
    } finally { doc.destroy(); }
  });

  it('stays writable beyond 200 updates with interleaved global sequences and no client snapshots', async () => {
    const first = await fixture();
    const second = await fixture();
    try {
      for (let index = 0; index < 202; index++) {
        for (const { id, doc } of [first, second]) {
          const update = edit(doc, () => textIn(doc).insert(index, 'x'));
          await repository.appendUpdate(id, update, userId);
        }
      }
      for (const { id, doc } of [first, second]) {
        const sync = await repository.loadSyncState(id);
        expect(sync.hasMore).toBe(false);
        expect(sync.updates.length).toBeLessThan(200);
        const current = await repository.readCurrent(id);
        expectContent(current.content, 'x'.repeat(202) + 'start');
        expect(Buffer.from(current.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(doc)));
        expect(await repository.persistCanonicalSnapshot(id, current.state, current.collabSeq))
          .toMatchObject({ status: 'persisted' });
      }
    } finally { first.doc.destroy(); second.doc.destroy(); }
  }, 30_000);

  it('accepts a near-limit duplicate replay and a size-reducing deletion', async () => {
    const { id, doc } = await fixture();
    try {
      // Canonical blocks are capped at 512 KiB. Auxiliary Yjs data exercises the
      // separate 2 MiB binary-history boundary alongside real paragraph edits.
      const first = edit(doc, () => {
        doc.getText('padding').insert(0, 'a'.repeat(800_000));
        textIn(doc).insert(0, 'pending ');
      });
      await repository.appendUpdate(id, first, userId);
      const second = edit(doc, () => doc.getText('padding').insert(800_000, 'b'.repeat(800_000)));
      await repository.appendUpdate(id, second, userId);
      await repository.compactCurrent(id);
      // Old snapshot + duplicate update exceeds 2 MiB, but actual state does not.
      await repository.appendUpdate(id, second, userId);
      const current = await repository.readCurrent(id);
      expectContent(current.content, 'pending start');
      expect(Buffer.from(current.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(doc)));
      const deletion = edit(doc, () => {
        doc.getText('padding').delete(0, 1_500_000);
        textIn(doc).delete(0, 'pending '.length);
      });
      await repository.appendUpdate(id, deletion, userId);
      const reduced = await repository.readCurrent(id);
      expectContent(reduced.content, 'start');
      expect(reduced.state.byteLength).toBeLessThan(110_000);
      expect(Buffer.from(reduced.state)).toEqual(Buffer.from(Y.encodeStateAsUpdate(doc)));
    } finally { doc.destroy(); }
  }, 30_000);
});
