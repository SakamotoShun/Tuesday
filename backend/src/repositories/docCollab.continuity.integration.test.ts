import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { BlockNoteEditor } from '@blocknote/core';
import { Transform } from 'prosemirror-transform';
import { initProseMirrorDoc, updateYFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { docSchema } from '../collab/docSchema';
import type { ContinuityPacket } from '../collab/docContinuityExperiment';
import { createDocReferenceCodec, DocReferenceError } from '../collab/docReference';

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
let db: typeof import('../db/client').db;
let tables: typeof import('../db/schema');
let orm: typeof import('drizzle-orm');
let fixtures: typeof import('../test/integration');
let repository: typeof import('./docCollab');
let resets: typeof import('./doc');
let idempotency: typeof import('../mcp/idempotency');
let service: typeof import('../services/doc');
let signed: typeof import('./docSpanReference');
let user: Parameters<typeof import('../services/doc').docService.getDoc>[1];
const editor = BlockNoteEditor.create({ schema: docSchema });
const clients: Y.Doc[] = [];
if (enabled) {
  ({ db } = await import('../db/client'));
  tables = await import('../db/schema');
  orm = await import('drizzle-orm');
  fixtures = await import('../test/integration');
  repository = await import('./docCollab');
  resets = await import('./doc');
  idempotency = await import('../mcp/idempotency');
  service = await import('../services/doc');
  signed = await import('./docSpanReference');
}

async function fixture() {
  const stored = await fixtures.seedDoc(null, user.id, { content: [
    { id: 'phrase', type: 'paragraph', props: { opaque: 'keep' }, custom: 'keep',
      content: [{ type: 'text', text: 'before TARGET after', styles: {} }], children: [] },
    { id: 'outside', type: 'paragraph', content: [{ type: 'text', text: 'outside', styles: { bold: true } }], children: [] },
  ] });
  const sync = await repository.docCollabRepository.loadSyncState(stored.id);
  const ydoc = new Y.Doc();
  clients.push(ydoc);
  Y.applyUpdate(ydoc, sync.snapshot!.snapshot);
  return { stored, ydoc };
}
function packet(doc: Y.Doc, parents: string[] = []): ContinuityPacket {
  const before = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
  const vector = Y.encodeStateVector(doc);
  const fragment = doc.getXmlFragment('prosemirror');
  const pm = initProseMirrorDoc(fragment, editor.pmSchema);
  const tr = new Transform(pm.doc).insert(3, editor.pmSchema.text('human '));
  updateYFragment(doc, fragment, tr.doc, pm.meta);
  return { id: randomUUID(), parents, before, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64'),
    evidence: { kind: 'pm', steps: tr.steps.map(step => step.toJSON()) } };
}
async function records(id: string) {
  return {
    doc: await db.query.docs.findFirst({ where: orm.eq(tables.docs.id, id) }),
    updates: await db.select().from(tables.docCollabUpdates).where(orm.eq(tables.docCollabUpdates.docId, id)),
    snapshots: await db.select().from(tables.docCollabSnapshots).where(orm.eq(tables.docCollabSnapshots.docId, id)),
    evidence: await db.select().from(tables.docCollabContinuity).where(orm.eq(tables.docCollabContinuity.docId, id)),
    audits: await db.select().from(tables.activityLogs).where(orm.eq(tables.activityLogs.entityId, id)),
    receipts: await db.select().from(tables.mcpIdempotencyKeys).where(orm.eq(tables.mcpIdempotencyKeys.resultEntityId, id)),
  };
}

(enabled ? describe : describe.skip)('Milestone 2B durable continuity and current projection', () => {
  beforeAll(async () => {
    await fixtures.ensureIntegrationDb();
    user = { ...await fixtures.seedUser({ role: 'member', employmentType: 'hourly' }), role: 'member', employmentType: 'hourly' };
  });
  afterAll(async () => {
    clients.forEach(doc => doc.destroy());
    if (!user) return;
    await db.delete(tables.activityLogs).where(orm.eq(tables.activityLogs.actorId, user.id));
    await db.delete(tables.docs).where(orm.eq(tables.docs.createdBy, user.id));
    await db.delete(tables.users).where(orm.eq(tables.users.id, user.id));
  });

  it('projects acknowledged text on authenticated read without a browser snapshot, once', async () => {
    const { stored, ydoc } = await fixture();
    const update = packet(ydoc);
    const seq = await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(update.update, 'base64'), user.id,
      { generation: stored.collabGeneration });
    expect((await records(stored.id)).doc!.content).toEqual(stored.content);
    const current = await service.docService.getDoc(stored.id, user);
    expect(current!.searchText).toContain('human before TARGET after');
    expect(current!.canonicalCollabSeq).toBe(seq);
    expect(current!.content).toMatchObject([{ custom: 'keep', props: { opaque: 'keep' } },
      { content: [{ text: 'outside', styles: { bold: true } }] }]);
    const settled = await records(stored.id);
    await service.docService.getDoc(stored.id, user);
    expect(await records(stored.id)).toEqual(settled);
    await expect(service.docService.getDoc(stored.id, { ...user, id: randomUUID() })).rejects.toThrow('Access denied');
  });

  it('keeps references usable across 150 ordinary updates, compaction and reload without a journal', async () => {
    const { stored, ydoc } = await fixture();
    const issued = await db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'phrase', 7, 13));
    for (let i = 0; i < 150; i++) {
      const update = packet(ydoc);
      await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(update.update, 'base64'), user.id,
        { generation: issued.generation, operationId: randomUUID() });
    }
    await repository.docCollabRepository.compactCurrent(stored.id);
    const result = await db.transaction(tx => repository.applyCurrentSpan(tx, { docId: stored.id, generation: issued.generation,
      reference: issued.reference, text: 'AGENT', actorId: user.id }));
    Y.applyUpdate(ydoc, result.update);
    expect((await repository.docCollabRepository.readCurrent(stored.id)).state).toEqual(Y.encodeStateAsUpdate(ydoc));
    expect((await records(stored.id)).evidence).toEqual([]);
  });

  it('refreshes discovery independently of browsers and leaves no-op version/timestamp unchanged', async () => {
    const { stored, ydoc } = await fixture();
    await repository.docCollabRepository.projectCurrent(stored.id);
    const initial = (await records(stored.id)).doc!;
    await repository.docCollabRepository.appendUpdate(stored.id, new Uint8Array([0, 0]), user.id);
    await repository.docCollabRepository.refreshProjections();
    const noop = (await records(stored.id)).doc!;
    expect(noop.version).toBe(initial.version);
    expect(noop.updatedAt).toEqual(initial.updatedAt);
    const update = packet(ydoc);
    await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(update.update, 'base64'), user.id);
    await repository.docCollabRepository.refreshProjections();
    const refreshed = (await records(stored.id)).doc!;
    expect(refreshed.searchText).toContain('human before TARGET after');
    expect(refreshed.collabProjectionPendingAt).toBeNull();
  });

  it('commits human evidence, patch, projection, audit and replay receipt exactly once', async () => {
    const { stored, ydoc } = await fixture();
    const issued = await db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'phrase', 7, 13));
    const evidence = packet(ydoc);
    const update = Buffer.from(evidence.update, 'base64');
    const operationId = randomUUID();
    const seq = await repository.docCollabRepository.appendUpdate(stored.id, update, user.id,
      { generation: issued.generation, operationId });
    expect(await repository.docCollabRepository.appendUpdate(stored.id, update, user.id,
      { generation: issued.generation, operationId })).toBe(seq);
    const beforeCompaction = (await records(stored.id)).evidence;
    await repository.docCollabRepository.compactCurrent(stored.id);
    expect((await records(stored.id)).evidence).toEqual(beforeCompaction);
    const token = { authType: 'oauth' as const, clientId: 'integration', tokenId: randomUUID(), userId: user.id,
      userName: user.name, userEmail: user.email, userRole: user.role, scopes: new Set(['docs:write']) };
    const input = { docId: stored.id, generation: issued.generation, reference: issued.reference, text: 'AGENT', actorId: user.id };
    const key = randomUUID();
    const run = () => idempotency.runIdempotentOperation(token, key, 'internal_patch_test', input, async tx => {
      const result = await repository.applyCurrentSpan(tx, input);
      return { response: result.response, resultEntityType: 'doc', resultEntityId: stored.id };
    }, async () => { await service.docService.getDoc(stored.id, user); });
    const results = await Promise.all([run(), run()]);
    expect(results[0]).toEqual(results[1]);
    const saved = await records(stored.id);
    expect(saved.doc!.searchText).toContain('human before AGENT after');
    expect(saved.doc!.collabGeneration).toBe(issued.generation);
    expect(saved.audits).toHaveLength(1);
    expect(saved.receipts).toHaveLength(1);
    expect(JSON.stringify(saved.audits[0]!.metadata)).not.toContain('TARGET');
    expect(await run()).toEqual(results[0]!);
    expect(await records(stored.id)).toEqual(saved);
  });

  it('rolls back preparation, delta, evidence and audit when receipt insertion fails', async () => {
    const { stored, ydoc } = await fixture();
    const issued = await db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'phrase', 7, 13));
    const evidence = packet(ydoc);
    await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(evidence.update, 'base64'), user.id,
      { generation: issued.generation });
    const before = await records(stored.id);
    // A nonexistent PAT fails the receipt FK only after the patch callback succeeds.
    const token = { tokenId: randomUUID(), userId: user.id, userName: user.name,
      userEmail: user.email, userRole: user.role, scopes: new Set(['docs:write']) };
    await expect(idempotency.runIdempotentOperation(token, randomUUID(), 'internal_patch_test', {}, async tx => {
      const result = await repository.applyCurrentSpan(tx, { docId: stored.id, generation: issued.generation,
        reference: issued.reference, text: 'ROLLBACK', actorId: user.id });
      return { response: result.response, resultEntityId: stored.id };
    }, async () => {})).rejects.toThrow();
    expect(await records(stored.id)).toEqual(before);
  });

  it('uses signed references across human edits and compaction, then replays an expired receipt after OAuth rotation', async () => {
    const { stored, ydoc } = await fixture();
    let elapsed = 0, denyReplay = false;
    const codec = createDocReferenceCodec('integration-private-signing-secret-'.repeat(2), () => Date.now() + elapsed);
    let token = { authType: 'oauth' as const, clientId: 'signed-integration', tokenId: randomUUID(), userId: user.id,
      userName: user.name, userEmail: user.email, userRole: user.role, scopes: new Set(['docs:write']) };
    const issued = await db.transaction(tx => signed.issueSignedCurrentSpan(tx, {
      docId: stored.id, blockId: 'phrase', from: 7, to: 13, token, authorised: stored,
    }, codec));
    const evidence = packet(ydoc);
    await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(evidence.update, 'base64'), user.id,
      { generation: issued.generation });
    await repository.docCollabRepository.compactCurrent(stored.id);
    const input = { docId: stored.id, targetRef: issued.targetRef, text: 'SIGNED' };
    const key = randomUUID();
    const run = (requestKey = key) => idempotency.runIdempotentOperation(token, requestKey, 'signed_patch_test', input, async tx => {
      const result = await signed.applySignedCurrentSpan(tx, { ...input, token, authorised: stored }, codec);
      return { response: result.response, resultEntityId: stored.id };
    }, async () => { await service.docService.getDoc(stored.id, denyReplay ? { ...user, id: randomUUID() } : user); });
    const result = await run();
    const committed = await records(stored.id);
    expect(committed.doc!.searchText).toContain('human before SIGNED after');
    expect(committed.receipts).toHaveLength(1);
    expect(JSON.stringify(committed.receipts[0]!.responseJson)).not.toContain(issued.targetRef);
    expect(JSON.stringify(committed.receipts[0]!.responseJson)).not.toContain('SIGNED');
    elapsed = 16 * 60 * 1000;
    token = { ...token, tokenId: randomUUID() };
    expect(await run()).toEqual(result);
    await expect(run(randomUUID())).rejects.toThrow('expired');
    denyReplay = true;
    await expect(run()).rejects.toThrow('Access denied');
    expect(await records(stored.id)).toEqual(committed);
  });

  it('rejects cross-document, wrong-principal and reset-generation signed patches without mutation', async () => {
    const first = await fixture(), other = await fixture();
    const codec = createDocReferenceCodec('integration-private-signing-secret-'.repeat(2));
    const token = { tokenId: randomUUID(), userId: user.id, userName: user.name, userEmail: user.email,
      userRole: user.role, scopes: new Set(['docs:write']) };
    const issued = await db.transaction(tx => signed.issueSignedCurrentSpan(tx, {
      docId: first.stored.id, blockId: 'phrase', from: 7, to: 13, token, authorised: first.stored,
    }, codec));
    const before = await records(first.stored.id), otherBefore = await records(other.stored.id);
    for (const input of [
      { docId: other.stored.id, token, authorised: other.stored },
      { docId: first.stored.id, token: { ...token, tokenId: randomUUID() }, authorised: first.stored },
    ]) await expect(db.transaction(tx => signed.applySignedCurrentSpan(tx, { ...input, targetRef: issued.targetRef, text: 'WRONG' }, codec))).rejects.toThrow(DocReferenceError);
    expect(await records(first.stored.id)).toEqual(before);
    expect(await records(other.stored.id)).toEqual(otherBefore);
    const nextOwner = await fixtures.seedUser();
    try {
      await db.update(tables.docs).set({ createdBy: nextOwner.id }).where(orm.eq(tables.docs.id, first.stored.id));
      const moved = await records(first.stored.id);
      await expect(db.transaction(tx => signed.applySignedCurrentSpan(tx, {
        docId: first.stored.id, token, targetRef: issued.targetRef, text: 'WRONG', authorised: first.stored,
      }, codec))).rejects.toThrow('Access denied');
      await expect(db.transaction(tx => signed.issueSignedCurrentSpan(tx, {
        docId: first.stored.id, blockId: 'phrase', from: 7, to: 13, token, authorised: first.stored,
      }, codec))).rejects.toThrow('Access denied');
      expect(await records(first.stored.id)).toEqual(moved);
    } finally {
      await db.update(tables.docs).set({ createdBy: user.id }).where(orm.eq(tables.docs.id, first.stored.id));
      await db.delete(tables.users).where(orm.eq(tables.users.id, nextOwner.id));
    }
    await resets.docRepository.updateContentAndResetCollab(first.stored.id, { content: first.stored.content });
    const reset = await records(first.stored.id);
    await expect(db.transaction(tx => signed.applySignedCurrentSpan(tx, {
      docId: first.stored.id, token, targetRef: issued.targetRef, text: 'WRONG', authorised: first.stored,
    }, codec))).rejects.toThrow(DocReferenceError);
    expect(await records(first.stored.id)).toEqual(reset);
  });

  it('rolls back current-read and journal preparation when reference encoding fails', async () => {
    const { stored, ydoc } = await fixture();
    await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(packet(ydoc).update, 'base64'), user.id);
    const before = await records(stored.id);
    const codec = createDocReferenceCodec('integration-private-signing-secret-'.repeat(2));
    const token = { tokenId: randomUUID(), userId: user.id, userName: user.name, userEmail: user.email,
      userRole: user.role, scopes: new Set(['docs:read']) };
    await expect(db.transaction(tx => signed.issueSignedCurrentSpan(tx, {
      docId: stored.id, blockId: 'phrase', from: 13, to: 19, token, authorised: stored,
    }, { ...codec, sign: () => { throw new DocReferenceError('REFERENCE_TOO_LARGE'); } }))).rejects.toThrow('size limit');
    expect(await records(stored.id)).toEqual(before);
  });

  it('accepts current targets after an ordinary writer without evidence', async () => {
    const { stored, ydoc } = await fixture();
    const issued = await db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'phrase', 7, 13));
    const evidence = packet(ydoc);
    await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(evidence.update, 'base64'), user.id);
    const current = await repository.docCollabRepository.projectCurrent(stored.id);
    expect(current.doc.searchText).toContain('human');
    await db.transaction(tx => repository.applyCurrentSpan(tx, { docId: stored.id, generation: issued.generation,
      reference: issued.reference, text: 'AGENT', actorId: user.id }));
    expect((await records(stored.id)).doc!.searchText).toContain('human before AGENT after');
    expect((await records(stored.id)).evidence).toEqual([]);
  });

  it('rotates only on destructive reset and rejects old-generation updates, snapshots and patches', async () => {
    const { stored, ydoc } = await fixture();
    const issued = await db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'phrase', 7, 13));
    await repository.docCollabRepository.compactCurrent(stored.id);
    expect((await records(stored.id)).doc!.collabGeneration).toBe(issued.generation);
    const reset = await resets.docRepository.updateContentAndResetCollab(stored.id, { content: stored.content });
    expect(reset!.collabGeneration).not.toBe(issued.generation);
    const before = await records(stored.id);
    expect(before.evidence).toHaveLength(0);
    await expect(repository.docCollabRepository.appendUpdate(stored.id, new Uint8Array([0, 0]), user.id,
      { generation: issued.generation })).rejects.toThrow('generation');
    await expect(repository.docCollabRepository.persistCanonicalSnapshot(stored.id, Y.encodeStateAsUpdate(ydoc), 0,
      issued.generation)).rejects.toThrow('generation');
    await expect(db.transaction(tx => repository.applyCurrentSpan(tx, { docId: stored.id, generation: issued.generation,
      reference: issued.reference, text: 'wrong', actorId: user.id }))).rejects.toThrow('generation');
    expect(await records(stored.id)).toEqual(before);
  });

  it('rejects contradictory operation retries without changing content', async () => {
    const { stored, ydoc } = await fixture();
    const issued = await db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'phrase', 7, 13));
    const evidence = packet(ydoc);
    const operationId = randomUUID();
    await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(evidence.update, 'base64'), user.id,
      { generation: issued.generation, operationId });
    const before = await records(stored.id);
    await expect(repository.docCollabRepository.appendUpdate(stored.id, new Uint8Array([0, 0]), user.id,
      { generation: issued.generation, operationId })).rejects.toThrow();
    expect(await records(stored.id)).toEqual(before);
  });

  it('lets discovery repair skip a locked document', async () => {
    const first = await fixture(), second = await fixture();
    for (const item of [first, second]) {
      await repository.docCollabRepository.appendUpdate(item.stored.id, Buffer.from(packet(item.ydoc).update, 'base64'), user.id);
    }
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = db.transaction(async tx => {
      await tx.select().from(tables.docs).where(orm.eq(tables.docs.id, first.stored.id)).for('update');
      ready();
      await gate;
    });
    try {
      await locked;
      await repository.docCollabRepository.refreshProjections();
      expect((await records(second.stored.id)).doc!.searchText).toContain('human');
      expect((await records(first.stored.id)).doc!.collabProjectionPendingAt).not.toBeNull();
    } finally { release(); await holder; }
    await repository.docCollabRepository.refreshProjections();
    expect((await records(first.stored.id)).doc!.searchText).toContain('human');
  });

  it('rolls back invalid initial issuance including projection and evidence preparation', async () => {
    const { stored, ydoc } = await fixture();
    await repository.docCollabRepository.appendUpdate(stored.id, Buffer.from(packet(ydoc).update, 'base64'), user.id);
    const before = await records(stored.id);
    await expect(db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'missing', 0, 1))).rejects.toThrow();
    expect(await records(stored.id)).toEqual(before);
  });

  it('projects code and styled table cells without changing Yjs history', async () => {
    const stored = await fixtures.seedDoc(null, user.id, { content: [
      { id: 'code', type: 'codeBlock', props: { language: 'typescript', opaque: 'keep' }, children: [],
        content: [{ type: 'text', text: 'const current = true', styles: {} }] },
      { id: 'table', type: 'table', props: {}, children: [], content: { type: 'tableContent',
        columnWidths: [180], headerRows: 1, rows: [{ cells: [{ type: 'tableCell', props: { textAlignment: 'center' },
          content: [{ type: 'text', text: 'Header', styles: { bold: true } }] }] }] } },
    ] });
    const baseline = await repository.docCollabRepository.readCurrent(stored.id);
    const projected = await repository.docCollabRepository.projectCurrent(stored.id);
    expect(projected.state).toEqual(baseline.state);
    expect(projected.doc.content).toMatchObject([
      { props: { language: 'typescript', opaque: 'keep' }, content: [{ text: 'const current = true' }] },
      { content: { headerRows: 1, columnWidths: [180], rows: [{ cells: [{ props: { textAlignment: 'center' },
        content: [{ text: 'Header', styles: { bold: true } }] }] }] } },
    ]);
  });

  it('repairs legacy replay prefixes atomically without publishing a partial read', async () => {
    const { stored, ydoc } = await fixture();
    const update = packet(ydoc);
    await db.insert(tables.docCollabUpdates).values(Array.from({ length: 201 }, (_, index) => ({
      docId: stored.id, actorId: user.id, update: index === 0 ? Buffer.from(update.update, 'base64') : Buffer.from([0, 0]),
    })));
    const before = await records(stored.id);
    await expect(db.transaction(tx => repository.issueCurrentSpan(tx, stored.id, 'missing', 0, 1))).rejects.toThrow();
    expect(await records(stored.id)).toEqual(before);
    const current = await service.docService.getDoc(stored.id, user);
    expect(current!.searchText).toContain('human before TARGET after');
    expect(current!.collabGeneration).toBe(stored.collabGeneration);
    const history = await repository.docCollabRepository.readCurrent(stored.id);
    expect(history.state).toEqual(Y.encodeStateAsUpdate(ydoc));
    expect((await records(stored.id)).updates.length).toBeLessThan(200);
  });

  it('backfills legacy generations and dirty discovery markers without changing content or history', async () => {
    const schemaName = `migration_2b_${randomUUID().replaceAll('-', '')}`;
    const sql = orm.sql;
    const migration = await Bun.file(new URL('../db/migrations/0056_doc_continuity_2b.sql', import.meta.url)).text();
    const rollback = new Error('rollback migration fixture');
    await expect(db.transaction(async tx => {
      await tx.execute(sql`CREATE SCHEMA ${sql.identifier(schemaName)}`);
      await tx.execute(sql`SET LOCAL search_path TO ${sql.identifier(schemaName)}, public`);
      await tx.execute(sql`CREATE TABLE docs (id uuid PRIMARY KEY, canonical_collab_seq bigint, version integer, content jsonb)`);
      await tx.execute(sql`CREATE TABLE doc_collab_updates (doc_id uuid, seq bigint, update bytea)`);
      await tx.execute(sql`CREATE TABLE doc_collab_snapshots (doc_id uuid, seq bigint, snapshot bytea)`);
      const ids = Array.from({ length: 4 }, () => randomUUID());
      for (const [index, id] of ids.entries()) {
        await tx.execute(sql`INSERT INTO docs VALUES (${id}, ${index === 0 ? null : 5}, 7, '[]'::jsonb)`);
      }
      await tx.execute(sql`INSERT INTO doc_collab_updates VALUES (${ids[1]}, 6, decode('aabb', 'hex'))`);
      await tx.execute(sql`INSERT INTO doc_collab_snapshots VALUES (${ids[2]}, 6, decode('ccdd', 'hex'))`);
      for (const statement of migration.split(';').filter(value => value.trim())) await tx.execute(sql.raw(statement));
      const rows = await tx.execute(sql`SELECT * FROM docs`);
      expect(new Set(rows.map(row => row.collab_generation)).size).toBe(4);
      for (const row of rows) {
        expect(row.collab_generation).toMatch(/^[a-f0-9-]{36}$/);
        expect(row.version).toBe(7);
        expect(row.content).toEqual([]);
        expect(row.collab_projection_pending_at !== null).toBe(row.id !== ids[3]);
      }
      const updates = await tx.execute(sql`SELECT encode(update, 'hex') AS bytes FROM doc_collab_updates`);
      const snapshots = await tx.execute(sql`SELECT encode(snapshot, 'hex') AS bytes FROM doc_collab_snapshots`);
      expect(updates[0]!.bytes).toBe('aabb');
      expect(snapshots[0]!.bytes).toBe('ccdd');
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
