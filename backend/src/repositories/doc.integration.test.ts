import { beforeAll, describe, expect, it } from 'bun:test';
import * as Y from 'yjs';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let db: typeof import('../db/client').db;
let docs: typeof import('../db/schema').docs;
let docCollabSnapshots: typeof import('../db/schema').docCollabSnapshots;
let docCollabUpdates: typeof import('../db/schema').docCollabUpdates;
let eq: typeof import('drizzle-orm').eq;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedDoc: typeof import('../test/integration').seedDoc;
let seedUser: typeof import('../test/integration').seedUser;
let docRepository: typeof import('./doc').docRepository;
let DocCollabPendingError: typeof import('./doc').DocCollabPendingError;
let docCollabRepository: typeof import('./docCollab').docCollabRepository;
let canonicalizeDocBlocks: typeof import('../collab/docContent').canonicalizeDocBlocks;
let yDocFromBlocks: typeof import('../collab/docContent').yDocFromBlocks;
let reconcileCanonicalDocCollabHistory: typeof import('../db/reconcileDocCollab').reconcileCanonicalDocCollabHistory;

if (runIntegration) {
  ({ db } = await import('../db/client'));
  ({ docs, docCollabSnapshots, docCollabUpdates } = await import('../db/schema'));
  ({ eq } = await import('drizzle-orm'));
  ({ ensureIntegrationDb, seedDoc, seedUser } = await import('../test/integration'));
  ({ docRepository, DocCollabPendingError } = await import('./doc'));
  ({ docCollabRepository } = await import('./docCollab'));
  ({ canonicalizeDocBlocks, yDocFromBlocks } = await import('../collab/docContent'));
  ({ reconcileCanonicalDocCollabHistory } = await import('../db/reconcileDocCollab'));
}

describeIntegration('Doc repository collaboration safety', () => {
  beforeAll(async () => {
    await ensureIntegrationDb();
  });

  it('preserves a durable update when a canonical reset is attempted', async () => {
    const user = await seedUser();
    const doc = await seedDoc(null, user.id, { content: [] });
    const ydoc = new Y.Doc();
    ydoc.getMap('content').set('durable', true);
    const seq = await docCollabRepository.appendUpdate(doc.id, Y.encodeStateAsUpdate(ydoc), user.id);

    await expect(docRepository.updateContentIfVersionAndResetCollab(doc.id, doc.version, {
      content: [{ id: 'replacement', type: 'paragraph', props: {}, children: [] }],
    })).rejects.toBeInstanceOf(DocCollabPendingError);

    const unchanged = await docRepository.findById(doc.id);
    const snapshots = await db.select().from(docCollabSnapshots).where(eq(docCollabSnapshots.docId, doc.id));
    const updates = await db.select().from(docCollabUpdates).where(eq(docCollabUpdates.docId, doc.id));
    expect(unchanged?.version).toBe(doc.version);
    expect(unchanged?.content).toEqual([]);
    expect(unchanged?.version).toBe(doc.version);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.seq).toBe(0);
    expect(updates.map((update) => update.seq)).toEqual([seq]);
  });

  it('atomically canonicalizes a current snapshot before allowing a reset', async () => {
    const user = await seedUser();
    const doc = await seedDoc(null, user.id, { content: [] });
    const changedContent = [{ id: 'canonical', type: 'paragraph', props: {}, content: [], children: [] }];
    const syncState = await docCollabRepository.loadSyncState(doc.id);
    if (!syncState.snapshot) throw new Error('Expected server collaboration baseline');
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, syncState.snapshot.snapshot);
    const baselineVector = Y.encodeStateVector(ydoc);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(yDocFromBlocks(changedContent)));
    const update = Y.encodeStateAsUpdate(ydoc, baselineVector);
    const seq = await docCollabRepository.appendUpdate(doc.id, update, user.id);
    const canonical = await docCollabRepository.persistCanonicalSnapshot(
      doc.id,
      Y.encodeStateAsUpdate(ydoc),
      seq,
    );

    expect(canonical.status).toBe('persisted');
    if (canonical.status !== 'persisted') throw new Error('Expected persisted canonical snapshot');
    expect(canonical.doc.version).toBe(doc.version + 1);
    expect(canonical.doc.canonicalCollabSeq).toBe(seq);
    expect(canonical.doc.content).toEqual(canonicalizeDocBlocks(changedContent));
    expect(await db.select().from(docCollabUpdates).where(eq(docCollabUpdates.docId, doc.id))).toHaveLength(0);

    const resetContent = [{ id: 'reset', type: 'paragraph', props: {}, children: [] }];
    const reset = await docRepository.updateContentIfVersionAndResetCollab(doc.id, canonical.doc.version, {
      content: resetContent,
      searchText: 'reset',
    });

    expect(reset?.version).toBe(canonical.doc.version + 1);
    expect(reset?.canonicalCollabSeq).toBe(0);
    expect(reset?.content).toEqual(resetContent);
    expect(await db.select().from(docCollabSnapshots).where(eq(docCollabSnapshots.docId, doc.id))).toHaveLength(0);
  });

  it('stores the sequence-zero baseline and treats an identical replay as a no-op', async () => {
    const user = await seedUser();
    const initialContent = [{
      id: 'initial',
      type: 'paragraph',
      props: { customProp: 'keep' },
      content: [],
      children: [],
      customTop: 'keep',
    }];
    const doc = await seedDoc(null, user.id, { content: initialContent });
    const syncState = await docCollabRepository.loadSyncState(doc.id);
    if (!syncState.snapshot) throw new Error('Expected server collaboration baseline');
    const snapshot = new Uint8Array(syncState.snapshot.snapshot);

    const first = await docCollabRepository.persistCanonicalSnapshot(doc.id, snapshot, 0);
    const replay = await docCollabRepository.persistCanonicalSnapshot(doc.id, snapshot, 0);
    const snapshots = await db.select().from(docCollabSnapshots).where(eq(docCollabSnapshots.docId, doc.id));

    expect(first.status).toBe('persisted');
    expect(replay.status).toBe('persisted');
    if (first.status !== 'persisted' || replay.status !== 'persisted') throw new Error('Expected persisted snapshots');
    expect(first.doc.content).toEqual([expect.objectContaining({
      id: expect.any(String),
      customTop: 'keep',
      props: expect.objectContaining({ customProp: 'keep' }),
    })]);
    expect(replay.doc.version).toBe(first.doc.version);
    expect(snapshots).toHaveLength(1);
  });

  it('blocks resets for newer compacted snapshots and unknown legacy markers', async () => {
    const user = await seedUser();
    const compactedDoc = await seedDoc(null, user.id, { content: [] });
    const snapshotDoc = new Y.Doc();
    snapshotDoc.getMap('content').set('compacted', true);
    await db.insert(docCollabSnapshots).values({
      docId: compactedDoc.id,
      snapshot: Buffer.from(Y.encodeStateAsUpdate(snapshotDoc)),
      seq: 5,
    });

    await expect(docRepository.updateContentIfVersionAndResetCollab(compactedDoc.id, compactedDoc.version, {
      content: [],
    })).rejects.toBeInstanceOf(DocCollabPendingError);
    expect(await db.select().from(docCollabSnapshots).where(eq(docCollabSnapshots.docId, compactedDoc.id))).toHaveLength(1);

    const legacyDoc = await seedDoc(null, user.id, { content: [] });
    await db.update(docs).set({ canonicalCollabSeq: null }).where(eq(docs.id, legacyDoc.id));
    await expect(docRepository.updateContentIfVersionAndResetCollab(legacyDoc.id, legacyDoc.version, {
      content: [],
    })).rejects.toBeInstanceOf(DocCollabPendingError);
  });

  it('reconciles valid legacy snapshots into canonical content', async () => {
    const user = await seedUser();
    const doc = await seedDoc(null, user.id, { content: [] });
    const content = [{ id: 'legacy-valid', type: 'paragraph', props: {}, content: [], children: [] }];
    const snapshot = Y.encodeStateAsUpdate(yDocFromBlocks(content));
    await db.insert(docCollabSnapshots).values({ docId: doc.id, seq: 9, snapshot: Buffer.from(snapshot) });
    await db.update(docs).set({ canonicalCollabSeq: null }).where(eq(docs.id, doc.id));

    await reconcileCanonicalDocCollabHistory();

    const recovered = await docRepository.findById(doc.id);
    expect(recovered?.canonicalCollabSeq).toBe(9);
    expect(recovered?.content).toEqual(canonicalizeDocBlocks(content));
    expect(recovered?.version).toBe(doc.version + 1);
  });

  it('compacts valid legacy histories beyond one bounded sync pass without resetting them', async () => {
    const user = await seedUser();
    const doc = await seedDoc(null, user.id, { content: [] });
    const content = [{ id: 'legacy-long', type: 'paragraph', props: {}, content: [], children: [] }];
    const update = Y.encodeStateAsUpdate(yDocFromBlocks(content));
    await db.insert(docCollabUpdates).values(Array.from({ length: 201 }, () => ({
      docId: doc.id,
      actorId: user.id,
      update: Buffer.from(update),
    })));
    await db.update(docs).set({ canonicalCollabSeq: null }).where(eq(docs.id, doc.id));

    await reconcileCanonicalDocCollabHistory();

    const recovered = await docRepository.findById(doc.id);
    const snapshots = await db.select().from(docCollabSnapshots).where(eq(docCollabSnapshots.docId, doc.id));
    const updates = await db.select().from(docCollabUpdates).where(eq(docCollabUpdates.docId, doc.id));
    expect(recovered?.canonicalCollabSeq).toBeGreaterThan(0);
    expect(recovered?.content).toEqual(canonicalizeDocBlocks(content));
    expect(recovered?.version).toBe(doc.version + 1);
    expect(updates).toHaveLength(0);
    expect(snapshots.some((snapshot) => snapshot.seq === recovered?.canonicalCollabSeq)).toBe(true);
  });

  it('resets malformed legacy history without changing canonical document fields', async () => {
    const user = await seedUser({ role: 'freelancer' });
    const content = [{ id: 'canonical', type: 'paragraph', props: {}, content: [], children: [] }];
    const doc = await seedDoc(null, user.id, { content, searchText: 'canonical' });
    await db.insert(docCollabUpdates).values({
      docId: doc.id,
      actorId: user.id,
      update: Buffer.from([1, 2, 3]),
    });
    await db.update(docs).set({ canonicalCollabSeq: null }).where(eq(docs.id, doc.id));

    await reconcileCanonicalDocCollabHistory();

    const recovered = await docRepository.findById(doc.id);
    const snapshots = await db.select().from(docCollabSnapshots).where(eq(docCollabSnapshots.docId, doc.id));
    const updates = await db.select().from(docCollabUpdates).where(eq(docCollabUpdates.docId, doc.id));
    expect(recovered).toMatchObject({
      canonicalCollabSeq: 0,
      content,
      searchText: doc.searchText,
      version: doc.version,
      updatedAt: doc.updatedAt,
    });
    expect(updates).toHaveLength(0);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.seq).toBe(0);
  });

  it('quarantines invalid canonical recovery and continues with later documents', async () => {
    const user = await seedUser();
    const first = await seedDoc(null, user.id, { content: [] });
    const second = await seedDoc(null, user.id, { content: [] });
    const [quarantined, recoverable] = [first, second].sort((left, right) => left.id < right.id ? -1 : 1);
    const recoverableContent = [
      { id: 'later-valid', type: 'paragraph', props: {}, content: [], children: [] },
    ];
    const malformedUpdate = Buffer.from([1, 2, 3]);

    await db.update(docs).set({
      content: { invalid: true },
      canonicalCollabSeq: null,
    }).where(eq(docs.id, quarantined.id));
    await db.insert(docCollabUpdates).values({
      docId: quarantined.id,
      actorId: user.id,
      update: malformedUpdate,
    });
    await db.insert(docCollabSnapshots).values({
      docId: recoverable.id,
      seq: 9,
      snapshot: Buffer.from(Y.encodeStateAsUpdate(yDocFromBlocks(recoverableContent))),
    });
    await db.update(docs).set({ canonicalCollabSeq: null }).where(eq(docs.id, recoverable.id));

    await reconcileCanonicalDocCollabHistory();
    await reconcileCanonicalDocCollabHistory();

    const quarantinedAfter = await docRepository.findById(quarantined.id);
    const quarantinedUpdates = await db
      .select()
      .from(docCollabUpdates)
      .where(eq(docCollabUpdates.docId, quarantined.id));
    const quarantinedSnapshots = await db
      .select()
      .from(docCollabSnapshots)
      .where(eq(docCollabSnapshots.docId, quarantined.id));
    const recoveredAfter = await docRepository.findById(recoverable.id);

    expect(quarantinedAfter).toMatchObject({
      canonicalCollabSeq: null,
      content: { invalid: true },
      version: quarantined.version,
    });
    expect(quarantinedUpdates).toHaveLength(1);
    expect(quarantinedUpdates[0]?.update).toEqual(malformedUpdate);
    expect(quarantinedSnapshots).toHaveLength(0);
    expect(recoveredAfter?.canonicalCollabSeq).toBe(9);
    expect(recoveredAfter?.content).toEqual(canonicalizeDocBlocks(recoverableContent));

    await db.delete(docs).where(eq(docs.id, quarantined.id));
    await db.delete(docs).where(eq(docs.id, recoverable.id));
  });
});
