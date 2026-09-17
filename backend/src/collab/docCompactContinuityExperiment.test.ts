import { afterEach, describe, expect, it } from 'bun:test';
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYDoc } from '@blocknote/core/yjs';
import { Step, Transform } from 'prosemirror-transform';
import { initProseMirrorDoc, updateYFragment, ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { CompactContinuityJournal, type CompactContinuityCheckpoint, type CompactContinuityReference } from './docCompactContinuityExperiment';
import { ContinuityJournal, type ContinuityDecision, type ContinuityPacket, type ContinuityReference } from './docContinuityExperiment';
import { docTargetSchema } from './docTargetSchema';
import { encodeContainerIdentity } from './docTargetExperiment';

const editor = BlockNoteEditor.create({ schema: docTargetSchema });
const docs: Y.Doc[] = [];
afterEach(() => { for (const doc of docs.splice(0)) doc.destroy(); });
const bytes = (value: Uint8Array) => Buffer.from(value).toString('base64');
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const root = (doc: Y.Doc) => doc.getXmlFragment('prosemirror');
const xml = (doc: Y.Doc, id = 'p') => {
  const block = [...root(doc).createTreeWalker(() => true)]
    .find(node => node instanceof Y.XmlElement && node.getAttribute('id') === id) as Y.XmlElement;
  return [...block.createTreeWalker(node => node instanceof Y.XmlText)][0] as Y.XmlText;
};
const ids = (text: Y.XmlText) => Array.from({ length: text.length }, (_, i) =>
  Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, i, 0)).item);
function load(data: Uint8Array) {
  const doc = new Y.Doc(); docs.push(doc); Y.applyUpdate(doc, data); return doc;
}
function canonical(doc: Y.Doc) {
  const copy = new Y.Doc();
  try { Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); return Y.encodeStateAsUpdate(copy); }
  finally { copy.destroy(); }
}
let sequence = 0;
function edit(doc: Y.Doc, parents: string[], run: (tr: Transform) => void): ContinuityPacket {
  const before = bytes(canonical(doc)), vector = Y.encodeStateVector(doc);
  const pm = initProseMirrorDoc(root(doc), editor.pmSchema), tr = new Transform(pm.doc);
  run(tr);
  updateYFragment(doc, root(doc), tr.doc, pm.meta);
  return { id: `compact-${++sequence}`, parents, before, update: bytes(Y.encodeStateAsUpdate(doc, vector)),
    evidence: { kind: 'pm', steps: tr.steps.map(step => step.toJSON()) } };
}
function split(tr: Transform, offset = 10) {
  tr.split(3 + offset, 2);
  const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
  tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, id: 'new' });
}
function join(tr: Transform) { tr.join(1 + tr.doc.firstChild!.firstChild!.nodeSize, 2); }
function setup(blocks: PartialBlock[] = [
  { id: 'p', type: 'paragraph', content: 'before TARGET after' },
  { id: 'other', type: 'paragraph', content: 'outside' },
], ttlMs = 1000) {
  const clock = { now: 0 }, now = () => clock.now;
  const doc = blocksToYDoc(editor, blocks); docs.push(doc);
  const compact = new CompactContinuityJournal(canonical(doc), { now, ttlMs });
  const oracle = new ContinuityJournal(canonical(doc), { now, ttlMs });
  const accept = (packet: ContinuityPacket) => {
    expect(compact.accept(packet).status).toBe('accepted');
    expect(oracle.accept(packet).status).toBe('accepted');
    expect(compact.currentState()).toEqual(oracle.currentState());
  };
  const change = (run: (tr: Transform) => void) => {
    const packet = edit(doc, compact.heads(), run); accept(packet); return packet;
  };
  const refs = (from = 7, to = 13, inlineIndex = 0) => ({
    compact: compact.issueSpan('p', from, to, inlineIndex), oracle: oracle.issueSpan('p', from, to, inlineIndex),
  });
  const compare = (ref: ReturnType<typeof refs>, expected: object) => {
    const actual = compact.evaluate(ref.compact);
    expect(actual).toMatchObject(expected);
    expect(actual).toEqual(oracle.evaluate(ref.oracle));
    const restored = CompactContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(compact.checkpoint())), { now });
    expect(restored.evaluate(ref.compact, canonical(doc))).toEqual(actual);
    return restored;
  };
  return { doc, compact, oracle, clock, now, change, accept, refs, compare };
}
function refuse(journal: CompactContinuityJournal, ref: CompactContinuityReference, status: ContinuityDecision['status']) {
  const before = journal.checkpoint(), state = journal.currentState();
  expect(journal.evaluate(ref).status).toBe(status);
  expect(() => journal.apply(ref, 'must not apply')).toThrow('Patch refused');
  expect(journal.checkpoint()).toEqual(before);
  expect(journal.currentState()).toEqual(state);
}

describe('serial compact storage differential', () => {
  it('keeps the original reference through reclamation, adjacent deletions, replacement and GC', () => {
    const f = setup();
    f.change(tr => { tr.insert(3 + tr.doc.firstChild!.firstChild!.nodeSize, editor.pmSchema.text('X')); });
    f.clock.now = 900;
    // Issue on an independent reader of the same checkpoint. The writer never
    // receives or registers this reference before processing later edits.
    const reader = CompactContinuityJournal.fromCheckpoint(f.compact.checkpoint(), { now: f.now });
    const ref = { compact: reader.issueSpan('p', 7, 13), oracle: f.oracle.issueSpan('p', 7, 13) };
    f.clock.now = 1001;
    const original = f.compact.currentState();
    expect(f.compact.compact().reclaimed).toBe(1);
    expect(f.compact.currentState()).toEqual(original);
    expect(f.compact.checkpoint().records).toHaveLength(0);
    f.compare(ref, { status: 'safe', start: 7, end: 13 });
    f.change(tr => { tr.delete(9, 10); });
    f.change(tr => { tr.delete(15, 16); });
    f.change(tr => { tr.replaceWith(9, 15, editor.pmSchema.text('HUMAN')); });
    const restored = f.compare(ref, { status: 'safe', start: 6, end: 11 });
    const before = load(restored.currentState()), outsideIds = ids(xml(before, 'other'));
    const targetIds = ids(xml(before)), identity = encodeContainerIdentity(xml(before));
    const result = restored.apply(ref.compact, 'agent');
    f.oracle.accept(result.packet);
    expect(restored.currentState()).toEqual(f.oracle.currentState());
    Y.applyUpdate(before, result.update);
    expect(before.gc).toBe(true);
    expect(xml(before).toString()).toBe('beforeagentafter');
    expect(ids(xml(before)).slice(0, 6)).toEqual(targetIds.slice(0, 6));
    expect(ids(xml(before)).slice(11)).toEqual(targetIds.slice(11));
    expect(ids(xml(before, 'other'))).toEqual(outsideIds);
    expect(encodeContainerIdentity(xml(before))).toBe(identity);
  });

  it.each(['split', 'net-zero', 'hard-break', 'import'] as const)('matches permanent %s invalidation and refuses mutation', shape => {
    const f = setup();
    // Reclaim older irrelevant evidence while the newer reference is live.
    f.change(() => {});
    f.clock.now = 900;
    const ref = f.refs(shape === 'import' ? 0 : 7, shape === 'import' ? 19 : 13);
    f.clock.now = 1001;
    f.compact.compact();
    f.change(tr => {
      if (shape === 'split' || shape === 'net-zero') split(tr);
      if (shape === 'net-zero') join(tr);
      if (shape === 'hard-break') tr.insert(13, editor.pmSchema.nodes.hardBreak.create());
      if (shape === 'import') join(tr);
    });
    const restored = f.compare(ref, { status: 'broken' });
    refuse(restored, ref.compact, 'broken');
    if (shape === 'split') {
      f.change(join);
      refuse(f.compare(ref, { status: 'broken' }), ref.compact, 'broken');
    }
    if (shape === 'net-zero' || shape === 'import') f.compare(f.refs(1, 4), { status: 'safe', start: 1, end: 4 });
  });

  it('matches boundary insertion, temporary deletion and replacement into the gap', () => {
    const f = setup(), ref = f.refs();
    f.change(tr => { tr.insert(16, editor.pmSchema.text('R')); tr.insert(10, editor.pmSchema.text('L')); });
    f.compare(ref, { status: 'safe', start: 7, end: 15 });
    f.change(tr => { tr.delete(10, 18); });
    refuse(f.compare(ref, { status: 'gone' }), ref.compact, 'gone');
    f.change(tr => { tr.insert(10, editor.pmSchema.text('restored')); });
    f.compare(ref, { status: 'safe', start: 7, end: 15 });
  });

  it('matches unknown for a broad replacement rather than widening the target', () => {
    const f = setup(), ref = f.refs();
    f.change(tr => { tr.replaceWith(3, 22, editor.pmSchema.text('new whole paragraph')); });
    refuse(f.compare(ref, { status: 'unknown' }), ref.compact, 'unknown');
  });

  it('preserves repeated-character identity, marks and Unicode through compact patching', () => {
    const f = setup([{ id: 'p', type: 'paragraph', content: [
      { type: 'text', text: 'aaa', styles: { bold: true } },
      { type: 'text', text: ' 🚀 e\u0301', styles: { italic: true } },
    ] }]);
    const before = ids(xml(f.doc)), ref = f.refs(0, 1);
    const result = f.compact.apply(ref.compact, '');
    f.oracle.accept(result.packet);
    Y.applyUpdate(f.doc, result.update);
    expect(f.compact.currentState()).toEqual(f.oracle.currentState());
    expect(ids(xml(f.doc))).toEqual(before.slice(1));
    expect(xml(f.doc).toDelta()).toEqual([
      { insert: 'aa', attributes: { bold: {} } }, { insert: ' 🚀 e\u0301', attributes: { italic: {} } },
    ]);
    expect(() => f.compact.issueSpan('p', 3, 4)).toThrow('surrogate');
  });

  it('does not retarget a deleted and recreated container after reload', () => {
    const f = setup(), ref = f.refs();
    const before = bytes(canonical(f.doc)), vector = Y.encodeStateVector(f.doc);
    const group = root(f.doc).get(0) as Y.XmlElement;
    const replacement = (group.get(0) as Y.XmlElement).clone();
    f.doc.transact(() => { group.delete(0, 1); group.insert(0, [replacement]); });
    f.accept({ id: 'recreate', parents: [], before, update: bytes(Y.encodeStateAsUpdate(f.doc, vector)), evidence: { kind: 'pm', steps: [] } });
    refuse(f.compare(ref, { status: 'gone' }), ref.compact, 'gone');
  });
});

describe('reclamation and failure bounds', () => {
  it('continues for 96 edits with overlapping unregistered reference lifetimes and bounded retained windows', () => {
    const f = setup(undefined, 160);
    let compact = f.compact;
    const live: Array<{ compact: CompactContinuityReference; oracle: ContinuityJournal; ref: ContinuityReference }> = [];
    let maximumRecords = 0, maximumBytes = 0, comparisons = 0;
    for (let i = 0; i < 96; i++) {
      f.clock.now = i * 10;
      if (i % 8 === 0) {
        const oracle = new ContinuityJournal(compact.currentState(), { now: f.now, ttlMs: 160 });
        const reader = CompactContinuityJournal.fromCheckpoint(compact.checkpoint(), { now: f.now });
        live.push({ compact: reader.issueSpan('p', 7, 13), oracle, ref: oracle.issueSpan('p', 7, 13) });
      }
      const packet = edit(f.doc, compact.heads(), tr => {
        tr.insert(3 + tr.doc.firstChild!.firstChild!.nodeSize, editor.pmSchema.text('x'));
      });
      compact.accept(packet);
      for (const pair of live) {
        if (f.clock.now >= pair.ref.expiresAt) {
          expect(compact.evaluate(pair.compact).status).toBe('expired');
          continue;
        }
        pair.oracle.accept({ ...packet, parents: pair.oracle.heads() });
        expect(compact.evaluate(pair.compact)).toEqual(pair.oracle.evaluate(pair.ref));
        expect(compact.evaluate(pair.compact)).toEqual({ status: 'safe', start: 7, end: 13 });
        comparisons++;
      }
      compact = CompactContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(compact.checkpoint())), { now: f.now });
      expect(compact.currentState()).toEqual(canonical(f.doc));
      maximumRecords = Math.max(maximumRecords, compact.checkpoint().records.length);
      maximumBytes = Math.max(maximumBytes, size(compact.checkpoint()));
    }
    expect(compact.checkpoint().floor.sequence).toBe(79);
    expect(maximumRecords).toBe(17);
    expect(comparisons).toBe(184);
    expect(maximumBytes).toBeLessThan(30_000);
    console.info(JSON.stringify({ experiment: 'rolling-retention', edits: 96, comparisons, maximumRecords, maximumBytes }));
  }, 30_000);

  it('reduces serialized evidence without claiming smaller peak replay memory', () => {
    const f = setup([{ id: 'p', type: 'paragraph', content: 'before TARGET after' },
      { id: 'other', type: 'paragraph', content: 'x'.repeat(150_000) }]);
    const ref = f.refs();
    for (let i = 0; i < 24; i++) f.change(tr => { tr.insert(tr.doc.content.size - 3, editor.pmSchema.text('z')); });
    f.compare(ref, { status: 'safe', start: 7, end: 13 });
    const compactBytes = size(f.compact.checkpoint()), preimageBytes = size(f.oracle.checkpoint());
    expect(compactBytes).toBeLessThan(preimageBytes / 10);
    expect(f.compact.checkpoint().records.every(record => !('before' in record) && !('targetRef' in record))).toBe(true);
    console.info(JSON.stringify({ experiment: 'serialized-retention', packets: 24, compactBytes, preimageBytes }));
    // Large-document replay verifies serialized size, not a five-second runtime budget.
  }, 30_000);

  it('keeps a live structural break while reclaiming only earlier evidence, then allows fresh issuance', () => {
    const f = setup();
    f.change(() => {});
    f.clock.now = 900;
    const ref = f.refs();
    f.change(tr => { split(tr); join(tr); });
    f.clock.now = 1001;
    expect(f.compact.compact().reclaimed).toBe(1);
    refuse(f.compare(ref, { status: 'broken' }), ref.compact, 'broken');
    f.clock.now = 1901;
    expect(f.compact.compact().reclaimed).toBe(1);
    refuse(f.compact, ref.compact, 'expired');
    f.compare(f.refs(), { status: 'safe', start: 7, end: 13 });
  });

  it('keeps the exact expiry boundary and a recently issued reference at an old idle head', () => {
    const f = setup(); f.change(() => {});
    f.clock.now = 999; const ref = f.refs();
    f.clock.now = 1000; expect(f.compact.compact().reclaimed).toBe(0);
    f.clock.now = 1001; expect(f.compact.compact().reclaimed).toBe(1);
    f.compare(ref, { status: 'safe', start: 7, end: 13 });
    f.clock.now = 1999; refuse(f.compact, ref.compact, 'expired');
  });

  it('refuses clock rollback after issuance and reclamation without resurrecting expired references', () => {
    const f = setup(); const ref = f.refs(); f.change(() => {});
    f.clock.now = 1001; f.compact.compact();
    const checkpoint = f.compact.checkpoint();
    f.clock.now = 1;
    refuse(f.compact, ref.compact, 'unknown');
    expect(() => f.compact.compact()).toThrow('Clock');
    expect(() => f.compact.issueSpan('p', 7, 13)).toThrow('Clock');
    expect(() => CompactContinuityJournal.fromCheckpoint(checkpoint, { now: f.now })).toThrow('Clock');
    expect(f.compact.checkpoint()).toEqual(checkpoint);
  });

  it('refuses overflow atomically; elapsed TTL permits a retry without losing human content', () => {
    const f = setup();
    const compact = new CompactContinuityJournal(canonical(f.doc), { now: f.now, ttlMs: 1000, maxPackets: 2 });
    const ref = compact.issueSpan('p', 7, 13);
    for (let i = 0; i < 2; i++) compact.accept(edit(f.doc, compact.heads(), tr => { tr.insert(3, editor.pmSchema.text('x')); }));
    const packet = edit(f.doc, compact.heads(), tr => { tr.insert(3, editor.pmSchema.text('HUMAN')); });
    const checkpoint = compact.checkpoint();
    expect(() => compact.accept(packet)).toThrow('budget');
    expect(compact.checkpoint()).toEqual(checkpoint);
    expect(xml(f.doc).toString()).toStartWith('HUMANxx');
    expect(compact.evaluate(ref, canonical(f.doc)).status).toBe('unknown');
    f.clock.now = 1001;
    expect(compact.accept(packet).status).toBe('accepted');
    expect(compact.currentState()).toEqual(canonical(f.doc));
    expect(compact.checkpoint().floor.sequence).toBe(2);
    refuse(compact, ref, 'expired');
  });

  it('preserves sticky coverage loss and its known break through expiry and checkpoint reload', () => {
    const f = setup(), ref = f.refs(); f.change(tr => { split(tr); join(tr); });
    f.compact.markIncomplete('missing net-zero batch');
    refuse(f.compact, ref.compact, 'broken');
    const before = f.compact.checkpoint();
    f.clock.now = 2000;
    expect(f.compact.compact().reclaimed).toBe(0);
    const restored = CompactContinuityJournal.fromCheckpoint(f.compact.checkpoint(), { now: f.now });
    expect(restored.checkpoint().records).toEqual(before.records);
    expect(() => restored.issueSpan('p', 7, 13)).toThrow('Coverage incomplete');
    expect(() => restored.accept(edit(f.doc, restored.heads(), () => {}))).toThrow('Coverage incomplete');
  });

  it('refuses byte overflow while retaining reserved space for bounded coverage loss', () => {
    const f = setup();
    const compact = new CompactContinuityJournal(canonical(f.doc), { now: f.now, maxBytes: 2500 });
    const before = compact.checkpoint();
    const packet = edit(f.doc, [], tr => { tr.insert(3, editor.pmSchema.text('x'.repeat(2000))); });
    expect(() => compact.accept(packet)).toThrow('budget');
    expect(compact.checkpoint()).toEqual(before);
    compact.markIncomplete('\ud800'.repeat(240));
    expect(size(compact.checkpoint())).toBeLessThanOrEqual(2500);
    const restored = CompactContinuityJournal.fromCheckpoint(compact.checkpoint(), { now: f.now });
    expect(restored.checkpoint()).toEqual(compact.checkpoint());
  });

  it('checks duplicates before reclamation and refuses stale replay after reclamation', () => {
    const f = setup(), packet = f.change(() => {});
    expect(f.compact.accept(packet).status).toBe('duplicate');
    expect(() => f.compact.accept({ ...packet, evidence: { kind: 'undo', sourceSteps: [] } })).toThrow('Contradictory');
    f.clock.now = 1001; f.compact.compact();
    const before = f.compact.checkpoint();
    expect(() => f.compact.accept(packet)).toThrow('frontier');
    expect(f.compact.checkpoint()).toEqual(before);
    const next = f.change(() => {});
    expect(f.compact.accept(next).status).toBe('duplicate');
  });

  it('does not commit a staged reclamation when a new packet has false evidence or a wrong preimage', () => {
    const f = setup(); f.change(() => {});
    f.clock.now = 1001;
    const packet = edit(f.doc, f.compact.heads(), tr => { tr.insert(3, editor.pmSchema.text('x')); });
    const before = f.compact.checkpoint(), state = f.compact.currentState();
    expect(() => f.compact.accept({ ...packet, before: bytes(canonical(f.doc)) })).toThrow('Preimage');
    expect(() => f.compact.accept({ ...packet, evidence: { kind: 'pm', steps: [] } })).toThrow();
    expect(f.compact.checkpoint()).toEqual(before);
    expect(f.compact.currentState()).toEqual(state);
    expect(f.compact.accept(packet).status).toBe('accepted');
    expect(f.compact.checkpoint().floor.sequence).toBe(1);
  });

  it('does not commit an otherwise safe patch when retention admission fails', () => {
    const f = setup();
    const compact = new CompactContinuityJournal(canonical(f.doc), { now: f.now, maxPackets: 1 });
    const ref = compact.issueSpan('p', 7, 13);
    compact.accept(edit(f.doc, [], () => {}));
    const before = compact.checkpoint(), state = compact.currentState();
    expect(compact.evaluate(ref)).toEqual({ status: 'safe', start: 7, end: 13 });
    expect(() => compact.apply(ref, 'agent')).toThrow('budget');
    expect(compact.checkpoint()).toEqual(before);
    expect(compact.currentState()).toEqual(state);
  });

  it('refuses inconsistent issuance cursors, epochs, snapshots and lifetimes', () => {
    const f = setup(), ref = f.refs().compact;
    f.change(tr => { tr.insert(3, editor.pmSchema.text('x')); });
    for (const corrupted of [
      { ...ref, sequence: 99 }, { ...ref, sequence: -1 }, { ...ref, sequence: 1 },
      { ...ref, epoch: 'another-epoch' }, { ...ref, expiresAt: ref.expiresAt + 1 },
      { ...ref, issuedAt: 1, expiresAt: ref.expiresAt + 1 }, { ...ref, issuedSnapshot: 'AA==' },
    ]) refuse(f.compact, corrupted, 'unknown');
  });

  it('rejects a concurrent branch without changing evidence or the human replica', () => {
    const f = setup(), fork = load(canonical(f.doc));
    const a = f.change(tr => { tr.insert(3, editor.pmSchema.text('A')); });
    const b = edit(fork, [], tr => { tr.insert(3, editor.pmSchema.text('B')); });
    const before = f.compact.checkpoint(), human = canonical(fork);
    expect(() => f.compact.accept(b)).toThrow('frontier');
    expect(f.compact.checkpoint()).toEqual(before);
    expect(canonical(fork)).toEqual(human);
    f.oracle.accept(b);
    expect(f.oracle.heads()).toEqual([a.id, b.id].sort());
  });

  it.each(['sequence', 'time', 'duplicate', 'evidence', 'delta', 'floor', 'limit'] as const)('rejects a malformed %s checkpoint', field => {
    const f = setup(); f.change(tr => { tr.insert(3, editor.pmSchema.text('x')); }); f.change(() => {});
    const checkpoint: CompactContinuityCheckpoint = f.compact.checkpoint();
    if (field === 'sequence') checkpoint.records[0]!.sequence++;
    if (field === 'time') checkpoint.records[0]!.admittedAt = 100;
    if (field === 'duplicate') checkpoint.records[1]!.id = checkpoint.records[0]!.id;
    if (field === 'evidence') checkpoint.records[0]!.evidence = { kind: 'pm', steps: [] };
    if (field === 'delta') checkpoint.records[0]!.update = 'AA==';
    if (field === 'floor') checkpoint.floor.head = 'not-a-zero-floor';
    if (field === 'limit') checkpoint.limits.maxPackets = 1;
    expect(() => CompactContinuityJournal.fromCheckpoint(checkpoint, { now: f.now })).toThrow();
  });
});

describe('undo retention boundary', () => {
  it.each([false, true])('compares a real inverse with source reclaimed=%s', reclaim => {
    const f = setup();
    const undo = new Y.UndoManager(root(f.doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = f.change(tr => { tr.insert(3 + tr.doc.firstChild!.firstChild!.nodeSize, editor.pmSchema.text('X')); });
      f.clock.now = 900;
      const ref = f.refs();
      if (reclaim) { f.clock.now = 1001; expect(f.compact.compact().reclaimed).toBe(1); }
      const pre = load(Buffer.from(source.before, 'base64'));
      let pm = initProseMirrorDoc(root(pre), editor.pmSchema).doc;
      const steps: unknown[] = [];
      if (source.evidence.kind !== 'pm') throw new Error('Expected PM source');
      for (const raw of source.evidence.steps) {
        const step = Step.fromJSON(editor.pmSchema, raw);
        steps.unshift(step.invert(pm).toJSON()); pm = step.apply(pm).doc!;
      }
      const before = bytes(canonical(f.doc)), vector = Y.encodeStateVector(f.doc);
      expect(undo.undo()).not.toBeNull();
      f.accept({ id: 'inverse', parents: [source.id], before, update: bytes(Y.encodeStateAsUpdate(f.doc, vector)),
        evidence: { kind: 'undo', sourceId: source.id, sourceSteps: steps } });
      expect(xml(f.doc, 'other').toString()).toBe('outside');
      expect(f.oracle.evaluate(ref.oracle)).toEqual({ status: 'safe', start: 7, end: 13 });
      if (reclaim) {
        // Measured conservative divergence, not full undo acceptance. A reference
        // can be new even though the native undo source is older than its TTL.
        refuse(f.compact, ref.compact, 'unknown');
        const restored = CompactContinuityJournal.fromCheckpoint(f.compact.checkpoint(), { now: f.now });
        refuse(restored, ref.compact, 'unknown');
        expect(restored.evaluate(restored.issueSpan('p', 7, 13))).toEqual({ status: 'safe', start: 7, end: 13 });
      } else f.compare(ref, { status: 'safe', start: 7, end: 13 });
    } finally { undo.destroy(); }
  });
});
