import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import type { WSContext } from 'hono/ws';
import { BlockNoteEditor } from '@blocknote/core';
import { Transform } from 'prosemirror-transform';
import { initProseMirrorDoc, updateYFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { docSchema } from '../collab/docSchema';
import { createDocReferenceCodec, DocReferenceError } from '../collab/docReference';
import { createDocTargetTools } from './doc-target-tools';
import { validateToolInput } from './validation';
import type { McpContext, TuesdayMcpTool } from './types';

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
let db: typeof import('../db/client').db;
let tables: typeof import('../db/schema');
let orm: typeof import('drizzle-orm');
let fixtures: typeof import('../test/integration');
let repository: typeof import('../repositories/docCollab');
let hub: typeof import('../collab/hub').docCollabHub;
let user: McpContext['user'];
const editor = BlockNoteEditor.create({ schema: docSchema });
const ydocs: Y.Doc[] = [];
if (enabled) {
  ({ db } = await import('../db/client'));
  tables = await import('../db/schema');
  orm = await import('drizzle-orm');
  fixtures = await import('../test/integration');
  repository = await import('../repositories/docCollab');
  ({ docCollabHub: hub } = await import('../collab/hub'));
}
function context(): McpContext {
  return { user, token: { userId: user.id, userName: user.name, userEmail: user.email, userRole: user.role,
    tokenId: randomUUID(), authType: 'oauth', clientId: randomUUID(), scopes: new Set(['docs:read', 'docs:write']) } };
}
async function fixture() {
  const doc = await fixtures.seedDoc(null, user.id, { content: [
    { id: 'p', type: 'paragraph', props: { opaque: 'keep' }, custom: 'keep', children: [], content: [
      { type: 'text', text: '😀 ', styles: { bold: true } }, { type: 'text', text: 'TARGET TARGET end', styles: {} },
    ] },
    { id: 'outside', type: 'paragraph', children: [], content: [{ type: 'text', text: 'outside', styles: { italic: true } }] },
  ] });
  const sync = await repository.docCollabRepository.loadSyncState(doc.id);
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, sync.snapshot!.snapshot);
  ydocs.push(ydoc);
  return { doc, ydoc };
}
async function records(docId: string) {
  return {
    doc: await db.query.docs.findFirst({ where: orm.eq(tables.docs.id, docId) }),
    updates: await db.select().from(tables.docCollabUpdates).where(orm.eq(tables.docCollabUpdates.docId, docId)),
    snapshots: await db.select().from(tables.docCollabSnapshots).where(orm.eq(tables.docCollabSnapshots.docId, docId)),
    operations: await db.select().from(tables.docCollabOperations).where(orm.eq(tables.docCollabOperations.docId, docId)),
    evidence: await db.select().from(tables.docCollabContinuity).where(orm.eq(tables.docCollabContinuity.docId, docId)),
    receipts: await db.select().from(tables.mcpIdempotencyKeys).where(orm.eq(tables.mcpIdempotencyKeys.resultEntityId, docId)),
    audits: await db.select().from(tables.activityLogs).where(orm.eq(tables.activityLogs.entityId, docId)),
  };
}
function dispatch(tools: TuesdayMcpTool[], ctx: McpContext) {
  return async <T>(name: string, input: unknown, current = ctx): Promise<T> => {
    const tool = tools.find(tool => tool.name === name)!;
    validateToolInput(tool, input);
    return await tool.handler(input, current) as T;
  };
}
type Search = { version: number; generation: string; collabSeq: number; nextOffset: number | null;
  matches: Array<{ blockId: string; inlineIndex: number; from: number; to: number; targetRef: string }> };

(enabled ? describe : describe.skip)('staged reference-aware document tool dispatch', () => {
  beforeAll(async () => {
    await fixtures.ensureIntegrationDb();
    user = { ...await fixtures.seedUser({ role: 'member', employmentType: 'hourly' }), role: 'member', employmentType: 'hourly' };
  });
  afterAll(async () => {
    ydocs.forEach(doc => doc.destroy());
    if (!user) return;
    await db.delete(tables.activityLogs).where(orm.eq(tables.activityLogs.actorId, user.id));
    await db.delete(tables.docs).where(orm.eq(tables.docs.createdBy, user.id));
    await db.delete(tables.users).where(orm.eq(tables.users.id, user.id));
  });

  it('searches marked text, preserves exact target through a human edit, and commits/replays one broadcast and receipt', async () => {
    const { doc, ydoc } = await fixture();
    const ctx = context();
    let elapsed = 0;
    const call = dispatch(createDocTargetTools(createDocReferenceCodec('dispatch-test-secret-at-least-32-characters', () => Date.now() + elapsed)), ctx);
    const first = await call<Search>('search_doc', { docId: doc.id, query: 'TARGET', limit: 1 });
    expect(first.matches).toMatchObject([{ blockId: 'p', inlineIndex: 0, from: 3, to: 9 }]);
    expect(first.nextOffset).toBe(1);
    const second = await call<Search>('search_doc', { docId: doc.id, query: 'TARGET', offset: 1 });
    expect(second.matches).toMatchObject([{ from: 10, to: 16 }]);
    const before = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    const vector = Y.encodeStateVector(ydoc), fragment = ydoc.getXmlFragment('prosemirror');
    const pm = initProseMirrorDoc(fragment, editor.pmSchema);
    const tr = new Transform(pm.doc).insert(3, editor.pmSchema.text('human '));
    updateYFragment(ydoc, fragment, tr.doc, pm.meta);
    const packet = { id: randomUUID(), parents: [], before,
      update: Buffer.from(Y.encodeStateAsUpdate(ydoc, vector)).toString('base64'),
      evidence: { kind: 'pm' as const, steps: tr.steps.map(step => step.toJSON()) } };
    await repository.docCollabRepository.appendUpdate(doc.id, Buffer.from(packet.update, 'base64'), user.id,
      { generation: first.generation });
    await repository.docCollabRepository.compactCurrent(doc.id);
    const messages: Array<{ generation: string; seq: number; update: string }> = [];
    const ws = { send: (value: string) => { const message = JSON.parse(value); messages.push(message);
      Y.applyUpdate(ydoc, Buffer.from(message.update, 'base64')); }, close: () => {} } as unknown as WSContext;
    hub.join(doc.id, { ws, user, lastSeenAt: Date.now(), awaitingPong: false });
    try {
      const input = { docId: doc.id, idempotencyKey: randomUUID(), operations: [
        { type: 'replace_text', targetRef: first.matches[0]!.targetRef, text: 'AGENT' },
      ] };
      const [left, right] = await Promise.all([call<Record<string, unknown>>('patch_doc', input), call<Record<string, unknown>>('patch_doc', input)]);
      expect(left).toEqual(right);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.generation).toBe(first.generation);
      const current = await repository.docCollabRepository.readCurrent(doc.id);
      expect(Y.encodeStateAsUpdate(ydoc)).toEqual(current.state);
      expect(current.content).toMatchObject([{ custom: 'keep', props: { opaque: 'keep' } },
        { content: [{ text: 'outside', styles: { italic: true } }] }]);
      expect(current.doc.searchText).toContain('human 😀 AGENT TARGET end');
      const settled = await records(doc.id);
      expect(settled.receipts).toHaveLength(1);
      expect(settled.audits).toHaveLength(1);
      expect(JSON.stringify(settled.receipts[0]!.responseJson)).not.toContain(first.matches[0]!.targetRef);
      elapsed += 16 * 60_000;
      const rotated = { ...ctx, token: { ...ctx.token, tokenId: randomUUID() } };
      expect(await call<Record<string, unknown>>('patch_doc', input, rotated)).toEqual(left);
      await expect(call('patch_doc', { ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'REFERENCE_EXPIRED' });
      await expect(call('patch_doc', { ...input, operations: [{ ...input.operations[0], text: 'DIFFERENT' }] })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(messages).toHaveLength(1);
      expect(await records(doc.id)).toEqual(settled);
    } finally { hub.leave(doc.id, ws); }
  });

  it('checks access, scope, role and strict operation shape before mutation', async () => {
    const { doc } = await fixture();
    const ctx = context(), call = dispatch(createDocTargetTools(createDocReferenceCodec('dispatch-test-secret-at-least-32-characters')), ctx);
    const before = await records(doc.id);
    await expect(call('search_doc', { docId: doc.id, query: 'TARGET' }, { ...ctx, token: { ...ctx.token, scopes: new Set() } })).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
    const otherId = randomUUID();
    await expect(call('get_doc', { docId: doc.id, includeTargets: true }, { user: { ...user, id: otherId }, token: { ...ctx.token, userId: otherId } })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    const patch = { docId: doc.id, idempotencyKey: 'invalid-test', operations: [{ type: 'replace_text', targetRef: 'opaque', text: 'x' }] };
    await expect(call('patch_doc', patch, { ...ctx, user: { ...user, role: 'freelancer' } })).rejects.toMatchObject({ code: 'READ_ONLY_ROLE' });
    await expect(call('patch_doc', { ...patch, operations: [...patch.operations, ...patch.operations] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(call('patch_doc', { ...patch, expectedVersion: 1 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(call('search_doc', { docId: doc.id, query: '\ud800' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await records(doc.id)).toEqual(before);
  });

  for (const change of ['disabled', 'freelancer'] as const) {
    it(`checks current account state when the authenticated context predates a ${change} change`, async () => {
      const { doc } = await fixture();
      const call = dispatch(createDocTargetTools(createDocReferenceCodec('dispatch-test-secret-at-least-32-characters')), context());
      const found = await call<Search>('search_doc', { docId: doc.id, query: 'TARGET' });
      const before = await records(doc.id);
      try {
        await db.update(tables.users).set(change === 'disabled' ? { isDisabled: true } : { role: 'freelancer' })
          .where(orm.eq(tables.users.id, user.id));
        await expect(call('patch_doc', { docId: doc.id, idempotencyKey: randomUUID(), operations: [
          { type: 'replace_text', targetRef: found.matches[0]!.targetRef, text: 'DENIED' },
        ] })).rejects.toMatchObject({ code: change === 'disabled' ? 'ACCESS_DENIED' : 'READ_ONLY_ROLE' });
        if (change === 'disabled') {
          await expect(call('search_doc', { docId: doc.id, query: 'TARGET' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
          await expect(call('get_doc', { docId: doc.id })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
        } else {
          expect((await call<Search>('search_doc', { docId: doc.id, query: 'TARGET' })).matches).toHaveLength(2);
        }
        expect(await records(doc.id)).toEqual(before);
      } finally {
        await db.update(tables.users).set({ isDisabled: false, role: 'member' }).where(orm.eq(tables.users.id, user.id));
      }
    });
  }

  for (const access of ['project', 'share'] as const) {
    for (const action of ['patch_doc', 'search_doc', 'get_doc'] as const) {
      it(`denies ${action} when ${access} access is revoked during the document lock wait`, async () => {
        const { doc } = await fixture();
        const reader = await fixtures.seedUser({ role: 'member', employmentType: 'hourly' });
        const project = access === 'project' ? await fixtures.seedProject(user.id) : null;
        let release = () => {};
        let blocker: Promise<void> | undefined;
        let pending: Promise<unknown> | undefined;
        try {
          if (project) {
            await db.update(tables.docs).set({ projectId: project.id }).where(orm.eq(tables.docs.id, doc.id));
            await fixtures.seedProjectMember(project.id, reader.id);
          } else {
            await db.insert(tables.docShares).values({ docId: doc.id, userId: reader.id, sharedBy: user.id, permission: 'edit' });
          }
          const original = context();
          const ctx: McpContext = { user: { ...reader, role: 'member', employmentType: 'hourly' },
            token: { ...original.token, userId: reader.id, userRole: 'member', userName: reader.name, userEmail: reader.email } };
          const call = dispatch(createDocTargetTools(createDocReferenceCodec('dispatch-test-secret-at-least-32-characters')), ctx);
          const found = await call<Search>('search_doc', { docId: doc.id, query: 'TARGET' });
          const before = await records(doc.id);
          const held = new Promise<void>(resolve => { release = resolve; });
          let acquired!: (pid: number) => void;
          const locked = new Promise<number>(resolve => { acquired = resolve; });
          blocker = db.transaction(async tx => {
            await tx.select().from(tables.docs).where(orm.eq(tables.docs.id, doc.id)).for('update');
            const [row] = await tx.execute<{ pid: number }>(orm.sql`select pg_backend_pid() as pid`);
            acquired(row!.pid);
            await held;
          });
          const pid = await locked;
          const input = action === 'patch_doc'
            ? { docId: doc.id, idempotencyKey: randomUUID(), operations: [{ type: 'replace_text', targetRef: found.matches[0]!.targetRef, text: 'DENIED' }] }
            : action === 'search_doc' ? { docId: doc.id, query: 'TARGET' } : { docId: doc.id };
          // Attach the rejection handler immediately; inspect the result after releasing the lock.
          pending = call(action, input).then(value => ({ value }), error => ({ error }));
          const deadline = Date.now() + 3000;
          let waiting = false;
          while (Date.now() < deadline) {
            const [row] = await db.execute<{ waiting: boolean }>(orm.sql`select exists (
              select 1 from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))
            ) as waiting`);
            if (row?.waiting) { waiting = true; break; }
            await Bun.sleep(10);
          }
          expect(waiting).toBe(true);
          if (project) await db.delete(tables.projectMembers).where(orm.and(
            orm.eq(tables.projectMembers.projectId, project.id), orm.eq(tables.projectMembers.userId, reader.id)));
          else await db.delete(tables.docShares).where(orm.and(
            orm.eq(tables.docShares.docId, doc.id), orm.eq(tables.docShares.userId, reader.id)));
          release();
          await blocker;
          expect(await pending).toMatchObject({ error: { code: 'ACCESS_DENIED' } });
          expect(await records(doc.id)).toEqual(before);
        } finally {
          release();
          await blocker;
          await pending;
          await db.delete(tables.docs).where(orm.eq(tables.docs.id, doc.id));
          if (project) await db.delete(tables.projects).where(orm.eq(tables.projects.id, project.id));
          await db.delete(tables.users).where(orm.eq(tables.users.id, reader.id));
        }
      });
    }
  }

  it('returns current selected inline targets, does not initialise evidence for no matches, and rolls back signing failures', async () => {
    const { doc, ydoc } = await fixture();
    const ctx = context(), codec = createDocReferenceCodec('dispatch-test-secret-at-least-32-characters');
    const call = dispatch(createDocTargetTools(codec), ctx);
    expect((await call<Search>('search_doc', { docId: doc.id, query: 'absent' })).matches).toEqual([]);
    expect((await records(doc.id)).evidence).toEqual([]);
    const read = await call<{ targets: Array<{ blockId: string; from: number; to: number }>; nextOffset: number | null }>('get_doc', { docId: doc.id, includeTargets: true, limit: 1 });
    expect(read.targets).toMatchObject([{ blockId: 'p', from: 0, to: 3 }]);
    expect(read.nextOffset).toBe(1);
    // Ordinary Yjs writers need no separate provenance protocol.
    const vector = Y.encodeStateVector(ydoc);
    const text = [...ydoc.getXmlFragment('prosemirror').createTreeWalker(node => node instanceof Y.XmlText)][0] as Y.XmlText;
    text.insert(0, 'latest ');
    await repository.docCollabRepository.appendUpdate(doc.id, Y.encodeStateAsUpdate(ydoc, vector), user.id);
    expect((await call<Search>('search_doc', { docId: doc.id, query: 'TARGET' })).matches).toHaveLength(2);
    expect((await records(doc.id)).evidence).toEqual([]);
    const plain = await call<{ searchText: string }>('get_doc', { docId: doc.id });
    expect(plain.searchText).toContain('latest');

    const fresh = await fixture();
    const baseline = await records(fresh.doc.id);
    const fail = dispatch(createDocTargetTools({ ...codec, sign: () => { throw new DocReferenceError('REFERENCE_TOO_LARGE'); } }), ctx);
    await expect(fail('search_doc', { docId: fresh.doc.id, query: 'TARGET' })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(await records(fresh.doc.id)).toEqual(baseline);
  });

  it('reports a cross-formatting literal hit without inventing a patchable reference', async () => {
    const doc = await fixtures.seedDoc(null, user.id, { content: [{ id: 'p', type: 'paragraph', children: [], content: [
      { type: 'text', text: 'TA', styles: { bold: true } }, { type: 'text', text: 'RGET TARGET', styles: {} },
    ] }] });
    const call = dispatch(createDocTargetTools(createDocReferenceCodec('dispatch-test-secret-at-least-32-characters')), context());
    const result = await call<{ matches: Array<{ from: number; to: number; targetStatus: string; targetRef?: string }> }>('search_doc', { docId: doc.id, query: 'TARGET' });
    expect(result.matches).toMatchObject([{ from: 0, to: 6, targetStatus: 'unavailable' }, { from: 7, to: 13, targetStatus: 'available' }]);
    expect(result.matches[0]!.targetRef).toBeUndefined();
    expect(result.matches[1]!.targetRef).toBeString();
  });

  it('reports table-cell hits without unsupported references and makes pagination exhaustion explicit', async () => {
    const doc = await fixtures.seedDoc(null, user.id, { content: [
      { id: 't', type: 'table', children: [], content: { type: 'tableContent', rows: [{ cells: ['left', 'TARGET'] }] } },
      { id: 'many', type: 'paragraph', children: [], content: [{ type: 'text', text: 'a'.repeat(1030), styles: {} }] },
    ] });
    const call = dispatch(createDocTargetTools(createDocReferenceCodec('dispatch-test-secret-at-least-32-characters')), context());
    const found = await call<Search>('search_doc', { docId: doc.id, query: 'TARGET' });
    expect(found.matches).toMatchObject([{ blockId: 't', inlineIndex: 1, from: 0, to: 6, targetStatus: 'unavailable' }]);
    expect(found.matches[0]!.targetRef).toBeUndefined();
    const current = await repository.docCollabRepository.readCurrent(doc.id);
    expect(current.content).toMatchObject([{ content: { rows: [{ cells: [
      { content: [{ text: 'left' }] }, { content: [{ text: 'TARGET' }] },
    ] }] } }, { id: 'many' }]);
    const page = await call<Search & { truncated: boolean }>('search_doc', { docId: doc.id, query: 'a', offset: 1000, limit: 20 });
    expect(page.matches).toHaveLength(20);
    expect(page.nextOffset).toBeNull();
    expect(page.truncated).toBe(true);
  });
});
