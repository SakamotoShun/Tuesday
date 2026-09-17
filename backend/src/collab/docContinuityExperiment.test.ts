import { afterEach, describe, expect, it } from 'bun:test';
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYDoc } from '@blocknote/core/yjs';
import { Step, Transform } from 'prosemirror-transform';
import { initProseMirrorDoc, updateYFragment, ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { ContinuityJournal, type ContinuityCheckpoint, type ContinuityDecision, type ContinuityPacket, type ContinuityReference } from './docContinuityExperiment';
import { docTargetSchema } from './docTargetSchema';
import { encodeContainerIdentity } from './docTargetExperiment';

const editor = BlockNoteEditor.create({ schema: docTargetSchema });
const docs: Y.Doc[] = [];
afterEach(() => { for (const doc of docs.splice(0)) doc.destroy(); });
const bytes = (value: Uint8Array) => Buffer.from(value).toString('base64');
const state = (doc: Y.Doc) => Y.encodeStateAsUpdate(doc);
const root = (doc: Y.Doc) => doc.getXmlFragment('prosemirror');
const xml = (doc: Y.Doc, id = 'p') => {
  const block = [...root(doc).createTreeWalker(() => true)].find(node => node instanceof Y.XmlElement && node.getAttribute('id') === id) as Y.XmlElement;
  return [...block.createTreeWalker(node => node instanceof Y.XmlText)][0] as Y.XmlText;
};
function load(data: Uint8Array) {
  const doc = new Y.Doc();
  docs.push(doc);
  Y.applyUpdate(doc, data);
  return doc;
}
function setup(blocks: PartialBlock[] = [{ id: 'p', type: 'paragraph', content: 'before TARGET after' }]) {
  const doc = blocksToYDoc(editor, blocks);
  docs.push(doc);
  return { doc, journal: new ContinuityJournal(state(doc)) };
}
let sequence = 0;
function edit(doc: Y.Doc, parents: string[], run: (tr: Transform) => void): ContinuityPacket {
  const before = bytes(state(doc)), vector = Y.encodeStateVector(doc);
  const pm = initProseMirrorDoc(root(doc), editor.pmSchema);
  const tr = new Transform(pm.doc);
  run(tr);
  updateYFragment(doc, root(doc), tr.doc, pm.meta);
  return { id: `edit-${++sequence}`, parents, before, update: bytes(Y.encodeStateAsUpdate(doc, vector)),
    evidence: { kind: 'pm', steps: tr.steps.map(step => step.toJSON()) } };
}
function split(tr: Transform, offset: number) {
  tr.split(3 + offset, 2);
  const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
  tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, id: 'new' });
}
function join(tr: Transform) { tr.join(1 + tr.doc.firstChild!.firstChild!.nodeSize, 2); }
function add(tr: Transform, value = 'second') {
  const first = tr.doc.firstChild!.firstChild!;
  tr.insert(1 + first.nodeSize, first.type.create({ ...first.attrs, id: 'other' },
    first.firstChild!.type.create(first.firstChild!.attrs, editor.pmSchema.text(value))));
}
function accepted(journal: ContinuityJournal, doc: Y.Doc, run: (tr: Transform) => void) {
  const packet = edit(doc, journal.heads(), run);
  expect(journal.accept(packet).status).toBe('accepted');
  return packet;
}
function refusal(journal: ContinuityJournal, ref: ContinuityReference, status: ContinuityDecision['status']) {
  const before = JSON.stringify(journal.checkpoint());
  expect(journal.evaluate(ref).status).toBe(status);
  expect(() => journal.apply(ref, 'wrong')).toThrow('Patch refused');
  expect(JSON.stringify(journal.checkpoint())).toBe(before);
}
function patched(journal: ContinuityJournal, ref: ContinuityReference, expected: string) {
  expect(journal.evaluate(ref)).toMatchObject({ status: 'safe' });
  const result = journal.apply(ref, 'agent');
  const current = load(journal.currentState());
  expect(xml(current).toString()).toBe(expected);
  expect(result.packet.evidence.kind).toBe('pm');
  expect(result.packet).not.toHaveProperty('targetRef');
  return result;
}

describe('certified causal span continuity', () => {
  it.each(['whole', 'interior'])('permanently rejects a %s split after rejoin, anchor loss, GC and checkpoint reload', shape => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', shape === 'whole' ? 0 : 7, shape === 'whole' ? 19 : 13);
    accepted(journal, doc, tr => split(tr, 10));
    refusal(journal, ref, 'broken');
    accepted(journal, doc, join);
    accepted(journal, doc, tr => { tr.delete(16, 22); tr.delete(3, 10); });
    const reloaded = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    expect(load(reloaded.currentState()).gc).toBe(true);
    refusal(reloaded, ref, 'broken');
    patched(reloaded, reloaded.issueSpan('p', 0, 6), 'agent');
  });

  it('records a net-zero split/rejoin as a permanent break despite an empty content update', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13), before = bytes(state(doc));
    const packet = accepted(journal, doc, tr => { split(tr, 10); join(tr); });
    expect(bytes(state(doc))).toBe(before);
    expect(Buffer.from(packet.update, 'base64')).toEqual(Buffer.from([0, 0]));
    refusal(journal, ref, 'broken');
  });

  it.each([false, true])('evaluates replacement before a split, same batch=%s', sameBatch => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const replace = (tr: Transform) => { tr.replaceWith(10, 16, editor.pmSchema.text('LONGER')); };
    if (sameBatch) accepted(journal, doc, tr => { replace(tr); split(tr, 10); });
    else { accepted(journal, doc, replace); accepted(journal, doc, tr => split(tr, 10)); }
    refusal(journal, ref, 'broken');
  });

  it.each(['existing', 'new'])('rejects boundary imports from a %s neighbour, but accepts an inner span', kind => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'first' },
      ...(kind === 'existing' ? [{ id: 'other', type: 'paragraph' as const, content: 'second' }] : [])]);
    const whole = journal.issueSpan('p', 0, 5), inner = journal.issueSpan('p', 1, 4);
    if (kind === 'new') accepted(journal, doc, add);
    accepted(journal, doc, join);
    refusal(journal, whole, 'broken');
    patched(journal, inner, 'fagenttsecond');
  });

  it('distinguishes literal insertion plus neighbour deletion from a join in the same batch', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'first' }, { id: 'other', type: 'paragraph', content: 'second' }]);
    const ref = journal.issueSpan('p', 0, 5);
    accepted(journal, doc, tr => {
      tr.insert(8, editor.pmSchema.text('second'));
      const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
      tr.delete(pos, pos + tr.doc.firstChild!.child(1).nodeSize);
    });
    patched(journal, ref, 'agent');
  });

  it('distinguishes literal replacement and independent new paragraph from splitting', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'TARGET' }]);
    const ref = journal.issueSpan('p', 0, 6);
    accepted(journal, doc, tr => { tr.replaceWith(3, 9, editor.pmSchema.text('TAR')); add(tr, 'GET'); });
    patched(journal, ref, 'agent');
  });

  it('rejects a typed new-neighbour import even when split/type/join share one batch', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'first' }]);
    const ref = journal.issueSpan('p', 0, 5);
    accepted(journal, doc, tr => {
      split(tr, 5);
      tr.insert(3 + tr.doc.firstChild!.firstChild!.nodeSize, editor.pmSchema.text('typed'));
      join(tr);
    });
    refusal(journal, ref, 'broken');
  });

  it('handles a synthetic merge retaining the second original container without widening its inner span', () => {
    const { doc, journal } = setup([{ id: 'first', type: 'paragraph', content: 'first' }, { id: 'p', type: 'paragraph', content: 'second' }]);
    const whole = journal.issueSpan('p', 0, 6), inner = journal.issueSpan('p', 1, 5);
    const before = bytes(state(doc)), vector = Y.encodeStateVector(doc);
    const pm = initProseMirrorDoc(root(doc), editor.pmSchema);
    const tr = new Transform(pm.doc);
    join(tr);
    tr.setNodeMarkup(1, undefined, { ...tr.doc.nodeAt(1)!.attrs, id: 'p' });
    doc.transact(() => { xml(doc).insert(0, 'first'); (root(doc).get(0) as Y.XmlElement).delete(0, 1); });
    journal.accept({ id: 'mirrored-join', parents: [], before, update: bytes(Y.encodeStateAsUpdate(doc, vector)),
      evidence: { kind: 'pm', steps: tr.steps.map(step => step.toJSON()) } });
    refusal(journal, whole, 'broken');
    patched(journal, inner, 'firstsagentd');
  });

  it.each(['prefix', 'suffix', 'previous-paragraph', 'next-paragraph'])('preserves the target after unrelated %s deletion', which => {
    const blocks: PartialBlock[] = [
      ...(which === 'previous-paragraph' ? [{ id: 'prev', type: 'paragraph' as const, content: 'previous' }] : []),
      { id: 'p', type: 'paragraph', content: 'before TARGET after' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ];
    const { doc, journal } = setup(blocks);
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => {
      if (which === 'prefix') tr.delete(9, 10);
      if (which === 'suffix') tr.delete(16, 22);
      if (which === 'previous-paragraph') tr.delete(1, 1 + tr.doc.firstChild!.firstChild!.nodeSize);
      if (which === 'next-paragraph') {
        const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
        tr.delete(pos, pos + tr.doc.firstChild!.child(1).nodeSize);
      }
    });
    patched(journal, ref, which === 'prefix' ? 'beforeagent after' : which === 'suffix' ? 'before agent' : 'before agent after');
  });

  it.each([13, 16, 19])('accepts a split at or after the target boundary: %s', offset => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => split(tr, offset));
    patched(journal, ref, `before agent${' after'.slice(0, offset - 13)}`);
  });

  it('accepts a net-zero split/rejoin exactly after a whole target', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'first' }]);
    const ref = journal.issueSpan('p', 0, 5);
    accepted(journal, doc, tr => { split(tr, 5); join(tr); });
    patched(journal, ref, 'agent');
  });

  it('accepts merging an empty neighbour without importing text', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'first' }, { id: 'other', type: 'paragraph', content: [] }]);
    const ref = journal.issueSpan('p', 0, 5);
    accepted(journal, doc, join);
    patched(journal, ref, 'agent');
  });

  it('accepts exact interval replacement and outward boundary insertions', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => { tr.replaceWith(10, 16, editor.pmSchema.text('HUMAN')); });
    accepted(journal, doc, tr => { tr.insert(15, editor.pmSchema.text('R')); tr.insert(10, editor.pmSchema.text('L')); });
    expect(journal.evaluate(ref)).toMatchObject({ status: 'safe', start: 7, end: 14 });
    patched(journal, ref, 'before agent after');
  });

  it.each([false, true])('transports the old passage through both adjacent deletions and replacement, one batch=%s', oneBatch => {
    let { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const reload = () => {
      doc = load(state(doc));
      journal = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
      expect(doc.gc).toBe(true);
    };
    reload();
    if (oneBatch) {
      accepted(journal, doc, tr => {
        tr.delete(9, 10);
        tr.delete(15, 16);
        tr.replaceWith(9, 15, editor.pmSchema.text('HUMAN'));
      });
    } else {
      accepted(journal, doc, tr => { tr.delete(9, 10); });
      expect(journal.evaluate(ref)).toEqual({ status: 'safe', start: 6, end: 12 });
      reload();
      accepted(journal, doc, tr => { tr.delete(15, 16); });
      expect(journal.evaluate(ref)).toEqual({ status: 'safe', start: 6, end: 12 });
      reload();
      accepted(journal, doc, tr => { tr.replaceWith(9, 15, editor.pmSchema.text('HUMAN')); });
    }
    expect(xml(doc).toString()).toBe('beforeHUMANafter');
    const oldPositions = [ref.target.start, ref.target.end].map(encoded =>
      Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(Buffer.from(encoded, 'base64')), doc, false)!.index);
    expect(oldPositions[0]).toBe(oldPositions[1]);
    expect(journal.evaluate(ref)).toEqual({ status: 'safe', start: 6, end: 11 });
    reload();
    expect(journal.evaluate(ref, state(doc))).toEqual({ status: 'safe', start: 6, end: 11 });
    patched(journal, ref, 'beforeagentafter');
  });

  it.each([false, true])('detects a permanent split after losing and replacing both anchors, one batch=%s', oneBatch => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const replace = (tr: Transform) => {
      tr.delete(9, 10); tr.delete(15, 16);
      tr.replaceWith(9, 15, editor.pmSchema.text('HUMAN'));
    };
    if (oneBatch) accepted(journal, doc, tr => { replace(tr); split(tr, 8); join(tr); });
    else {
      accepted(journal, doc, replace);
      accepted(journal, doc, tr => split(tr, 8));
      accepted(journal, doc, join);
    }
    const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    refusal(restored, ref, 'broken');
    patched(restored, restored.issueSpan('p', 6, 11), 'beforeagentafter');
  });

  it('refuses PM/Yjs boundary disagreement rather than retargeting repeated text', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'aaa' }]);
    const ref = journal.issueSpan('p', 0, 1);
    accepted(journal, doc, tr => { tr.delete(3, 4); });
    // The final-string reconciler deletes the last a, not the PM-selected first a.
    refusal(journal, ref, 'unknown');
  });

  it('rejects original-container recreation even with the same logical block ID', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const before = bytes(state(doc)), vector = Y.encodeStateVector(doc);
    const group = root(doc).get(0) as Y.XmlElement;
    const clone = (group.get(0) as Y.XmlElement).clone();
    doc.transact(() => { group.delete(0, 1); group.insert(0, [clone]); });
    journal.accept({ id: 'recreate', parents: [], before, update: bytes(Y.encodeStateAsUpdate(doc, vector)), evidence: { kind: 'pm', steps: [] } });
    expect(encodeContainerIdentity(xml(doc))).not.toBe(ref.target.container);
    refusal(journal, ref, 'gone');
  });

  it('rejects a hard-break import, but accepts an inner span before the break', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'left\nright' }]);
    const left = journal.issueSpan('p', 0, 4), inner = journal.issueSpan('p', 1, 3), right = journal.issueSpan('p', 0, 5, 1);
    accepted(journal, doc, tr => { tr.delete(7, 8); });
    refusal(journal, left, 'broken');
    refusal(journal, right, 'broken');
    patched(journal, inner, 'lagenttright');
  });

  it('does not invalidate a later inline segment when a hard break is inserted elsewhere', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'left\nright' }]);
    const ref = journal.issueSpan('p', 0, 5, 1);
    accepted(journal, doc, tr => { tr.insert(5, editor.pmSchema.nodes.hardBreak.create()); });
    expect(journal.evaluate(ref).status).toBe('safe');
    const result = journal.apply(ref, 'agent');
    expect(result.blocks[0].content).toEqual([{ type: 'text', text: 'le\nft\nagent', styles: {} }]);
  });

  it('rejects a hard break inserted through the selected inline segment', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => { tr.insert(13, editor.pmSchema.nodes.hardBreak.create()); });
    refusal(journal, ref, 'broken');
  });

  it('treats ordinary deletion as temporarily gone, not a permanent structural break', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => { tr.delete(10, 16); });
    refusal(journal, ref, 'gone');
    accepted(journal, doc, tr => { tr.insert(10, editor.pmSchema.text('restored')); });
    patched(journal, ref, 'before agent after');
  });

  it('preserves outside character identities for exact deletion in repeated text', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'aaa' }]);
    const identity = (text: Y.XmlText, i: number) => bytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, i, 0)));
    const ids = [identity(xml(doc), 1), identity(xml(doc), 2)];
    const ref = journal.issueSpan('p', 0, 1);
    journal.apply(ref, '');
    const current = xml(load(journal.currentState()));
    expect(current.toString()).toBe('aa');
    expect([identity(current, 0), identity(current, 1)]).toEqual(ids);
  });

  it('preserves target marks and rejects cross-mark or invalid Unicode issuance', () => {
    const { journal } = setup([{ id: 'p', type: 'paragraph', content: [
      { type: 'text', text: 'left ', styles: { bold: true } },
      { type: 'text', text: 'target', styles: { italic: true } },
      { type: 'text', text: ' right', styles: {} },
    ] }]);
    expect(() => journal.issueSpan('p', 0, 8)).toThrow('boundaries');
    const result = journal.apply(journal.issueSpan('p', 5, 11), 'agent');
    expect(result.blocks[0].content).toEqual([
      { type: 'text', text: 'left ', styles: { bold: true } },
      { type: 'text', text: 'agent', styles: { italic: true } },
      { type: 'text', text: ' right', styles: {} },
    ]);
    const unicode = setup([{ id: 'p', type: 'paragraph', content: 'A\u{1F680}Z' }]).journal;
    expect(() => unicode.issueSpan('p', 1, 2)).toThrow('surrogate');
    expect(unicode.evaluate(unicode.issueSpan('p', 1, 3)).status).toBe('safe');
  });
});

describe('causal packets, expiry and explicit uncertainty', () => {
  it('supports pre-issued references across forks, pending dependencies, duplicate and reversed delivery', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'before TARGET after' }, { id: 'other', type: 'paragraph', content: 'second' }]);
    const ref = journal.issueSpan('p', 7, 13), fork = load(state(doc));
    const a = edit(doc, [], tr => { tr.insert(3, editor.pmSchema.text('A')); });
    const b = edit(fork, [], tr => { tr.insert(3, editor.pmSchema.text('B')); });
    const c = edit(fork, [b.id], tr => { tr.insert(3, editor.pmSchema.text('C')); });
    expect(journal.accept(c).status).toBe('pending');
    refusal(journal, ref, 'unknown');
    expect(journal.accept(a).status).toBe('accepted');
    expect(journal.accept(b).accepted).toEqual([b.id, c.id]);
    expect(journal.accept(c).status).toBe('duplicate');
    expect(journal.evaluate(ref).status).toBe('safe');
    const other = new ContinuityJournal(Buffer.from(a.before, 'base64'));
    other.accept(b); other.accept(c); other.accept(a);
    expect(bytes(other.currentState())).toBe(bytes(journal.currentState()));
    journal.apply(ref, 'agent');
    expect(xml(load(journal.currentState())).toString()).toContain('before agent after');
  });

  it('breaks a pre-issued reference on an uninformed offline split despite a concurrent replacement', () => {
    const { doc, journal } = setup(), fork = load(state(doc));
    const ref = journal.issueSpan('p', 7, 13);
    const a = edit(doc, [], tr => { tr.replaceWith(10, 16, editor.pmSchema.text('LONGER')); });
    const b = edit(fork, [], tr => split(tr, 10));
    journal.accept(a); journal.accept(b);
    refusal(journal, ref, 'broken');
  });

  it('returns unknown for relevant concurrent issuance, rather than guessing boundary lineage', () => {
    const { doc, journal } = setup(), fork = load(state(doc));
    accepted(journal, doc, tr => { tr.replaceWith(10, 16, editor.pmSchema.text('LONGER')); });
    const ref = journal.issueSpan('p', 7, 13);
    journal.accept(edit(fork, [], tr => split(tr, 10)));
    refusal(journal, ref, 'unknown');
  });

  it('allows concurrent issuance when the other branch edits a different paragraph', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'before TARGET after' }, { id: 'other', type: 'paragraph', content: 'second' }]);
    const fork = load(state(doc));
    accepted(journal, doc, tr => { tr.replaceWith(10, 16, editor.pmSchema.text('LONGER')); });
    const ref = journal.issueSpan('p', 7, 13);
    journal.accept(edit(fork, [], tr => {
      const offset = 3 + tr.doc.firstChild!.firstChild!.nodeSize;
      tr.insert(offset, editor.pmSchema.text('outside'));
    }));
    patched(journal, ref, 'before agent after');
  });

  it('allows an unrelated concurrent event that never observed the newly issued endpoints', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'TARGET' }, { id: 'other', type: 'paragraph', content: 'second' }]);
    const fork = load(state(doc));
    accepted(journal, doc, tr => { tr.replaceWith(3, 9, editor.pmSchema.text('LONGER')); });
    const ref = journal.issueSpan('p', 1, 5);
    expect(Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(Buffer.from(ref.target.start, 'base64')), fork, false)).toBeNull();
    journal.accept(edit(fork, [], tr => { tr.insert(3 + tr.doc.firstChild!.firstChild!.nodeSize, editor.pmSchema.text('outside')); }));
    patched(journal, ref, 'LagentR');
  });

  it('joins agreeing parent lineages before a causally later replacement', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'before TARGET after' }, { id: 'other', type: 'paragraph', content: 'second' }]);
    const fork = load(state(doc));
    const ref = journal.issueSpan('p', 7, 13);
    const a = edit(doc, [], tr => { tr.delete(9, 10); tr.delete(15, 16); });
    const b = edit(fork, [], tr => { tr.insert(3 + tr.doc.firstChild!.firstChild!.nodeSize, editor.pmSchema.text('outside')); });
    journal.accept(b); journal.accept(a);
    const merged = load(journal.currentState());
    accepted(journal, merged, tr => { tr.replaceWith(9, 15, editor.pmSchema.text('HUMAN')); });
    const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    patched(restored, ref, 'beforeagentafter');
  });

  it('reconciles two outside-only concurrent boundaries, but a certified independent split still breaks', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'abcdef' }]);
    const fork = load(state(doc)), splitFork = load(state(doc));
    const ref = journal.issueSpan('p', 1, 3);
    const empty = journal.checkpoint();
    const a = edit(doc, [], tr => { tr.delete(3, 4); });
    const b = edit(fork, [], tr => { tr.insert(3, editor.pmSchema.text('X')); });
    journal.accept(a); journal.accept(b);
    const reversed = ContinuityJournal.fromCheckpoint(empty);
    reversed.accept(b); reversed.accept(a);
    expect(bytes(journal.currentState())).toBe(bytes(reversed.currentState()));
    expect(journal.evaluate(ref)).toEqual({ status: 'safe', start: 1, end: 3 });
    expect(reversed.evaluate(ref)).toEqual(journal.evaluate(ref));
    for (const original of [journal, reversed]) {
      expect(original.accept(a).status).toBe('duplicate');
      expect(original.accept(b).status).toBe('duplicate');
      const reloaded = ContinuityJournal.fromCheckpoint(original.checkpoint());
      expect(reloaded.evaluate(ref)).toEqual({ status: 'safe', start: 1, end: 3 });
      const before = load(reloaded.currentState());
      const outside = [0, 3, 4, 5].map(index => Y.createRelativePositionFromTypeIndex(xml(before), index, 0));
      patched(reloaded, ref, 'Xagentdef');
      const after = load(reloaded.currentState());
      expect(outside.map(position => Y.createAbsolutePositionFromRelativePosition(position, after, false)?.index)).toEqual([0, 6, 7, 8]);
    }
    const broken = edit(splitFork, [], tr => split(tr, 2));
    journal.accept(broken); reversed.accept(broken);
    refusal(journal, ref, 'broken');
    expect(reversed.evaluate(ref)).toEqual(journal.evaluate(ref));
  });

  it.each(['first', 'middle', 'last', 'container'])('refuses concurrent outside evidence when the original %s is recreated', kind => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'abcdef' }]);
    const fork = load(state(doc)), ref = journal.issueSpan('p', 1, 4);
    const a = edit(doc, [], tr => { tr.delete(3, 4); });
    const b = edit(fork, [], tr => { tr.insert(3, editor.pmSchema.text('X')); });
    const pre = load(Buffer.from(b.before, 'base64'));
    if (kind === 'container') {
      const group = root(fork).get(0) as Y.XmlElement;
      const clone = (group.get(0) as Y.XmlElement).clone();
      group.delete(0, 1); group.insert(0, [clone]);
    } else {
      const text = xml(fork), index = kind === 'first' ? 2 : kind === 'middle' ? 3 : 4;
      const value = text.toString().slice(index, index + 1);
      text.delete(index, 1); text.insert(index, value);
    }
    // Same final projection and truthful outside PM step, but a reconciler has
    // replaced original identities. Never use visible-text equality to certify it.
    b.update = bytes(Y.encodeStateAsUpdate(fork, Y.encodeStateVector(pre)));
    const baseline = journal.checkpoint();
    for (const packets of [[a, b], [b, a]]) {
      const candidate = ContinuityJournal.fromCheckpoint(baseline);
      for (const packet of packets) expect(candidate.accept(packet).status).toBe('accepted');
      refusal(candidate, ref, kind === 'container' ? 'gone' : 'unknown');
      refusal(ContinuityJournal.fromCheckpoint(candidate.checkpoint()), ref, kind === 'container' ? 'gone' : 'unknown');
    }
  });

  it.each([false, true])('reconciles successive concurrent keys in every delivery order (later issuance: %s)', later => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'abcdef' }]);
    if (later) accepted(journal, doc, tr => { tr.insert(3, editor.pmSchema.text('P')); });
    const fork = load(state(doc)), ref = journal.issueSpan('p', later ? 2 : 1, later ? 4 : 3);
    const baseline = journal.checkpoint(), parents = journal.heads();
    const a = edit(doc, parents, tr => { tr.delete(3, later ? 5 : 4); });
    const b = edit(fork, parents, tr => { tr.insert(3, editor.pmSchema.text('X')); });
    const c = edit(fork, [b.id], tr => { tr.insert(4, editor.pmSchema.text('Y')); });
    for (const packets of [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]]) {
      const candidate = ContinuityJournal.fromCheckpoint(baseline);
      for (const packet of packets) candidate.accept(packet);
      for (const packet of packets) expect(candidate.accept(packet).status).toBe('duplicate');
      expect(candidate.evaluate(ref)).toEqual({ status: 'safe', start: 2, end: 4 });
      const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(candidate.checkpoint())));
      const before = load(restored.currentState());
      const outside = [0, 1, 4, 5, 6].map(index => Y.createRelativePositionFromTypeIndex(xml(before), index, 0));
      patched(restored, ref, 'XYagentdef');
      const after = load(restored.currentState());
      expect(outside.map(position => Y.createAbsolutePositionFromRelativePosition(position, after, false)?.index)).toEqual([0, 1, 7, 8, 9]);
      before.destroy(); after.destroy();
    }
    fork.destroy();
  });

  it.each(['multiple-steps', 'third-branch'])('reconciles outside-only %s using the same item proof', kind => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'abcdef' }]);
    const fork = load(state(doc)), extra = load(state(doc)), ref = journal.issueSpan('p', 1, 3);
    journal.accept(edit(doc, [], tr => { tr.delete(3, 4); }));
    journal.accept(edit(fork, [], tr => {
      tr.insert(3, editor.pmSchema.text('X'));
      if (kind === 'multiple-steps') tr.insert(4, editor.pmSchema.text('Y'));
    }));
    if (kind === 'third-branch') journal.accept(edit(extra, [], tr => { tr.insert(9, editor.pmSchema.text('Y')); }));
    patched(ContinuityJournal.fromCheckpoint(journal.checkpoint()), ref, kind === 'multiple-steps' ? 'XYagentdef' : 'XagentdefY');
    fork.destroy(); extra.destroy();
  });

  it('reconciles successive outside deletions after the original boundary anchor is gone', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'aaabcdef' }]);
    const fork = load(state(doc)), ref = journal.issueSpan('p', 3, 5), baseline = journal.checkpoint();
    const a = edit(doc, [], tr => { tr.delete(3, 4); });
    const a2 = edit(doc, [a.id], tr => { tr.delete(3, 4); });
    const a3 = edit(doc, [a2.id], tr => { tr.delete(3, 4); });
    const b = edit(fork, [], tr => { tr.insert(3, editor.pmSchema.text('X')); });
    const b2 = edit(fork, [b.id], tr => { tr.insert(4, editor.pmSchema.text('Y')); });
    for (const packets of [[a, a2, a3, b, b2], [b2, a3, a2, b, a], [a3, a2, a, b2, b]]) {
      const candidate = ContinuityJournal.fromCheckpoint(baseline);
      for (const packet of packets) candidate.accept(packet);
      expect(candidate.evaluate(ref)).toEqual({ status: 'safe', start: 2, end: 4 });
      patched(ContinuityJournal.fromCheckpoint(candidate.checkpoint()), ref, 'XYagentdef');
    }
    fork.destroy();
  });

  it.each(['replacement', 'later-inside-step', 'later-boundary-insertion', 'disjoint-normalisation'])('keeps %s outside the concurrent outside-only proof', kind => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'abcdef' }]);
    const fork = load(state(doc)), extra = load(state(doc)), ref = journal.issueSpan('p', 1, 3);
    const a = edit(doc, [], tr => { tr.delete(3, 4); });
    const b = edit(fork, [], tr => {
      if (kind === 'replacement') tr.replaceWith(3, 4, editor.pmSchema.text('X'));
      else tr.insert(3, editor.pmSchema.text('X'));
      if (kind === 'later-inside-step') tr.replaceWith(5, 7, editor.pmSchema.text('bc'));
      if (kind === 'later-boundary-insertion') tr.insert(5, editor.pmSchema.text('Y'));
      // The whole-final-document reconciler recreates the target between these
      // disjoint edits. Outside-only PM steps cannot authorise replacement IDs.
      if (kind === 'disjoint-normalisation') tr.insert(10, editor.pmSchema.text('Y'));
    });
    journal.accept(a); journal.accept(b);
    refusal(journal, ref, 'unknown');
    refusal(ContinuityJournal.fromCheckpoint(journal.checkpoint()), ref, 'unknown');
    fork.destroy(); extra.destroy();
  });

  it('keeps whole-body replacement covering both anchors explicitly uncertified', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => { tr.replaceWith(3, 22, editor.pmSchema.text('replacement')); });
    refusal(journal, ref, 'unknown');
  });

  it('returns unknown for unsupported mark steps without accepting a patch', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => { tr.addMark(3, 4, editor.pmSchema.marks.bold.create()); });
    refusal(journal, ref, 'unknown');
  });

  it('rejects malformed, contradictory and delete-coverage-mismatched packets without changing the journal', () => {
    const { doc, journal } = setup();
    const valid = edit(doc, [], tr => { tr.delete(3, 4); });
    const before = JSON.stringify(journal.checkpoint());
    expect(() => journal.accept({ ...valid, before: '!!!!' })).toThrow();
    expect(() => journal.accept({ ...valid, evidence: { kind: 'pm', steps: [] } })).toThrow('Evidence does not match');
    expect(() => journal.accept({ ...valid, update: '!!!!' })).toThrow();
    expect(JSON.stringify(journal.checkpoint())).toBe(before);
    journal.accept(valid);
    const stable = JSON.stringify(journal.checkpoint());
    expect(() => journal.accept({ ...valid, parents: ['wrong'] })).toThrow('Contradictory');
    const missingDeletion = edit(doc, [], tr => { tr.insert(3, editor.pmSchema.text('x')); });
    expect(() => journal.accept(missingDeletion)).toThrow('declared causal state');
    expect(JSON.stringify(journal.checkpoint())).toBe(stable);
  });

  it('detects an external current-state deletion even when state vectors still match', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const vector = bytes(Y.encodeStateVector(doc));
    xml(doc).delete(0, 1);
    expect(bytes(Y.encodeStateVector(doc))).toBe(vector);
    expect(journal.evaluate(ref, state(doc))).toMatchObject({ status: 'unknown', reason: expect.stringContaining('not covered') });
    const before = JSON.stringify(journal.checkpoint());
    expect(() => journal.apply(ref, 'no', state(doc))).toThrow('Patch refused');
    expect(JSON.stringify(journal.checkpoint())).toBe(before);
  });

  it('rejects unresolved Yjs dependencies and cyclic packets atomically', () => {
    const { doc, journal } = setup();
    const foreign = load(state(doc));
    xml(foreign).insert(0, 'not observed');
    const vector = Y.encodeStateVector(foreign);
    xml(foreign).insert(1, 'dependent');
    const before = JSON.stringify(journal.checkpoint());
    expect(() => journal.accept({ id: 'missing-struct', parents: [], before: bytes(state(doc)),
      update: bytes(Y.encodeStateAsUpdate(foreign, vector)), evidence: { kind: 'pm', steps: [] } })).toThrow('unresolved dependencies');
    expect(JSON.stringify(journal.checkpoint())).toBe(before);
    const a = { id: 'a', parents: ['b'], before: bytes(state(doc)), update: bytes(new Uint8Array([0, 0])), evidence: { kind: 'pm' as const, steps: [] } };
    expect(journal.accept(a).status).toBe('pending');
    const pending = JSON.stringify(journal.checkpoint());
    expect(() => journal.accept({ ...a, id: 'b', parents: ['a'] })).toThrow('Cyclic');
    expect(JSON.stringify(journal.checkpoint())).toBe(pending);
    const restored = ContinuityJournal.fromCheckpoint(JSON.parse(pending));
    expect(restored.checkpoint()).toEqual(journal.checkpoint());
    expect(() => restored.issueSpan('p', 7, 13)).toThrow('Pending evidence');
  });

  it('refuses invalid replacement content atomically and never falls back to a body operation', () => {
    const { journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const before = JSON.stringify(journal.checkpoint());
    expect(() => journal.apply(ref, 'bad\nnewline')).toThrow('hard-break');
    expect(JSON.stringify(journal.checkpoint())).toBe(before);
  });

  it('expires original references after checkpoint reload without renewing the clock', () => {
    const { doc } = setup();
    let now = 100;
    const journal = new ContinuityJournal(state(doc), { now: () => now, ttlMs: 20 });
    const ref = journal.issueSpan('p', 7, 13);
    now = 119;
    const reloaded = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())), { now: () => now });
    expect(reloaded.evaluate(ref).status).toBe('safe');
    now = 120;
    refusal(reloaded, ref, 'expired');
    expect(reloaded.evaluate(reloaded.issueSpan('p', 7, 13)).status).toBe('safe');
  });

  it('bounds accepted and pending evidence without evicting history', () => {
    const { doc } = setup();
    const journal = new ContinuityJournal(state(doc), { maxPackets: 1 });
    const a = edit(doc, [], tr => { tr.insert(3, editor.pmSchema.text('x')); });
    journal.accept(a);
    const before = JSON.stringify(journal.checkpoint());
    expect(() => journal.accept(edit(doc, [a.id], tr => { tr.insert(3, editor.pmSchema.text('y')); }))).toThrow('budget exhausted');
    expect(JSON.stringify(journal.checkpoint())).toBe(before);
    const small = new ContinuityJournal(Buffer.from(a.before, 'base64'), {
      maxBytes: new ContinuityJournal(a.before).retentionStats().budgetBytes,
    });
    expect(() => small.accept(a)).toThrow('budget exhausted');
    expect(small.heads()).toEqual([]);
  });
});

describe('sticky coverage loss', () => {
  function fill(journal: ContinuityJournal, count: number) {
    for (let i = 0; i < count; i++) journal.accept({ id: `neutral-${i}`, parents: journal.heads(),
      before: bytes(journal.currentState()), update: bytes(new Uint8Array([0, 0])), evidence: { kind: 'pm', steps: [] } });
  }

  it.each([32, 64, 128])('retains %s serial packets, bounds the full checkpoint, and refuses atomically', maxPackets => {
    const { doc } = setup();
    const journal = new ContinuityJournal(state(doc), { maxPackets });
    const ref = journal.issueSpan('p', 7, 13);
    for (let i = 0; i < maxPackets; i++) journal.accept({ id: `serial-${i}`, parents: journal.heads(),
      before: bytes(state(doc)), update: bytes(new Uint8Array([0, 0])), evidence: { kind: 'pm', steps: [] } });
    const checkpoint = journal.checkpoint();
    expect(() => journal.apply(ref, 'agent')).toThrow('budget exhausted');
    expect(journal.checkpoint()).toEqual(checkpoint);
    journal.markIncomplete('\\'.repeat(240));
    expect(Buffer.byteLength(JSON.stringify(journal.checkpoint()))).toBeLessThanOrEqual(journal.retentionStats().budgetBytes);
    expect(journal.retentionStats().budgetBytes).toBeLessThanOrEqual(checkpoint.limits.maxBytes);
    expect(ContinuityJournal.fromCheckpoint(journal.checkpoint()).checkpoint()).toEqual(journal.checkpoint());
  });

  it('reserves coverage space at the byte boundary, including an empty reloaded checkpoint', () => {
    const { doc } = setup();
    const baseline = bytes(state(doc));
    expect(() => new ContinuityJournal(baseline, { maxBytes: baseline.length + 10 })).toThrow('budget exhausted');
    const journal = new ContinuityJournal(baseline, { maxBytes: new ContinuityJournal(baseline).retentionStats().budgetBytes });
    const before = journal.checkpoint();
    expect(() => journal.accept({ id: 'extra', parents: [], before: baseline,
      update: bytes(new Uint8Array([0, 0])), evidence: { kind: 'pm', steps: [] } })).toThrow('budget exhausted');
    expect(journal.checkpoint()).toEqual(before);
    journal.markIncomplete('😀'.repeat(120));
    expect(Buffer.byteLength(JSON.stringify(journal.checkpoint()))).toBeLessThan(journal.checkpoint().limits.maxBytes);
    expect(ContinuityJournal.fromCheckpoint(journal.checkpoint()).checkpoint()).toEqual(journal.checkpoint());
    expect(() => ContinuityJournal.fromCheckpoint({ ...before, epoch: 'e'.repeat(128) })).toThrow('budget exhausted');
  });

  it('keeps a 32-head causal frontier when the retention capacity is 128', () => {
    const { doc } = setup();
    const journal = new ContinuityJournal(state(doc), { maxPackets: 128 });
    const packet = { parents: [], before: bytes(state(doc)), update: bytes(new Uint8Array([0, 0])),
      evidence: { kind: 'pm' as const, steps: [] } };
    for (let i = 0; i < 32; i++) journal.accept({ ...packet, id: `branch-${i}` });
    const before = journal.checkpoint();
    expect(() => journal.accept({ ...packet, id: 'branch-33' })).toThrow('Causal frontier budget exhausted');
    expect(journal.checkpoint()).toEqual(before);
    journal.markIncomplete('Frontier exhausted');
    expect(ContinuityJournal.fromCheckpoint(journal.checkpoint()).checkpoint()).toEqual(journal.checkpoint());
  });

  it('persists loss independently of identical bytes at the packet budget, without evicting evidence', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13), binary = bytes(state(doc));
    expect(journal.checkpoint().coverage).toEqual({ status: 'complete' });
    fill(journal, 32);
    const before = journal.checkpoint();
    expect(journal.evaluate(ref).status).toBe('safe');
    expect(() => journal.accept({ id: 'overflow', parents: journal.heads(), before: binary,
      update: bytes(new Uint8Array([0, 0])), evidence: { kind: 'pm', steps: [] } })).toThrow('budget exhausted');
    expect(journal.checkpoint()).toEqual(before);
    journal.markIncomplete('Missing content-neutral batch after admission exhausted');
    expect(bytes(journal.currentState())).toBe(binary);
    expect(journal.checkpoint()).toEqual({ ...before, coverage: { status: 'incomplete', reason: 'Missing content-neutral batch after admission exhausted', knownCut: ['neutral-31'] } });
    expect(journal.evaluate(ref, state(doc))).toMatchObject({ status: 'unknown', reason: expect.stringContaining('Coverage incomplete') });
    refusal(journal, ref, 'unknown');
    expect(() => journal.issueSpan('p', 7, 13)).toThrow('Coverage incomplete');
    const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    expect(restored.checkpoint()).toEqual(journal.checkpoint());
    refusal(restored, ref, 'unknown');
    expect(() => restored.issueSpan('p', 7, 13)).toThrow('Coverage incomplete');
    expect(restored.accept(before.packets[31]).status).toBe('duplicate');
    restored.markIncomplete('A later reason cannot reset or grow the first failure');
    expect(restored.checkpoint()).toEqual(journal.checkpoint());
  });

  it('handles an overflowing accepted PM batch even when it emits no Yjs content update', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13), binary = bytes(state(doc));
    const packet = edit(doc, [], tr => {
      for (let i = 0; i < 257; i++) { tr.insert(3, editor.pmSchema.text('x')); tr.delete(3, 4); }
    });
    expect(packet.evidence.kind === 'pm' && packet.evidence.steps.length).toBe(514);
    expect(packet.update).toBe(bytes(new Uint8Array([0, 0])));
    const before = journal.checkpoint();
    expect(() => journal.accept(packet)).toThrow('Malformed packet');
    expect(journal.checkpoint()).toEqual(before);
    // A separate control signal is necessary; no changed-content comparison can detect this.
    journal.markIncomplete('Accepted PM step budget exhausted');
    expect(bytes(state(doc))).toBe(binary);
    expect(journal.evaluate(ref, binary).status).toBe('unknown');
    refusal(journal, ref, 'unknown');
  });

  it('cannot clear loss through subsequent acceptance, duplicates, or checkpoint roundtrips', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const first = accepted(journal, doc, tr => { tr.insert(3, editor.pmSchema.text('x')); });
    journal.markIncomplete('First missing batch');
    expect(journal.accept(first).status).toBe('duplicate');
    accepted(journal, doc, tr => { tr.insert(3, editor.pmSchema.text('y')); });
    journal.markIncomplete('Second missing batch');
    refusal(journal, ref, 'unknown');
    const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    accepted(restored, doc, tr => { tr.insert(3, editor.pmSchema.text('z')); });
    expect(restored.checkpoint().coverage).toEqual({ status: 'incomplete', reason: 'First missing batch', knownCut: [first.id] });
    expect(restored.evaluate(ref, state(doc)).status).toBe('unknown');
    const copy = restored.checkpoint();
    copy.coverage = { status: 'complete' };
    expect(restored.checkpoint().coverage.status).toBe('incomplete');
    expect(() => restored.issueSpan('p', 10, 16)).toThrow('Coverage incomplete');
  });

  it('bounds the first reason and never accumulates later reasons', () => {
    const { journal } = setup();
    const before = journal.checkpoint();
    journal.markIncomplete(`\n${'\u{1F680}'.repeat(50_000)}`);
    const lost = journal.checkpoint();
    expect(lost.coverage.status).toBe('incomplete');
    if (lost.coverage.status !== 'incomplete') throw new Error('Expected coverage loss');
    expect(lost.coverage.reason.length).toBeLessThanOrEqual(240);
    expect(Buffer.byteLength(lost.coverage.reason)).toBeLessThanOrEqual(720);
    expect(lost.coverage.reason).not.toContain('\n');
    expect(lost.packets).toEqual(before.packets);
    for (let i = 0; i < 10; i++) journal.markIncomplete('ignored'.repeat(50_000));
    expect(journal.checkpoint()).toEqual(lost);
    expect(ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(lost))).checkpoint()).toEqual(lost);
    const empty = setup().journal;
    empty.markIncomplete(' \n ');
    expect(empty.checkpoint().coverage).toEqual({ status: 'incomplete', reason: 'Unspecified coverage loss', knownCut: [] });
  });

  it.each([
    ['missing', undefined], ['null', null], ['boolean', false], ['unknown status', { status: 'reset' }],
    ['incomplete without reason', { status: 'incomplete', knownCut: [] }], ['empty reason', { status: 'incomplete', reason: '', knownCut: [] }],
    ['non-string reason', { status: 'incomplete', reason: 12, knownCut: [] }], ['oversized reason', { status: 'incomplete', reason: 'x'.repeat(241), knownCut: [] }],
    ['contradictory complete', { status: 'complete', reason: 'lost' }],
    ['extra fields', { status: 'incomplete', reason: 'lost', knownCut: [], reset: true }],
    ['missing frontier', { status: 'incomplete', reason: 'lost' }],
    ['unknown frontier', { status: 'incomplete', reason: 'lost', knownCut: ['unknown-event'] }],
    ['duplicate frontier', { status: 'incomplete', reason: 'lost', knownCut: ['a', 'a'] }],
  ])('rejects malformed checkpoint coverage: %s', (_label, coverage) => {
    const { journal } = setup();
    journal.markIncomplete('Retained loss');
    const checkpoint = journal.checkpoint();
    expect(() => ContinuityJournal.fromCheckpoint({ ...checkpoint, coverage } as ContinuityCheckpoint)).toThrow('Invalid checkpoint coverage');
    expect(journal.checkpoint()).toEqual(checkpoint);
  });

  it('keeps expiry independent of coverage loss and never reopens issuance after expiry', () => {
    const { doc } = setup();
    let now = 100;
    const journal = new ContinuityJournal(state(doc), { now: () => now, ttlMs: 20 });
    const ref = journal.issueSpan('p', 7, 13);
    journal.markIncomplete('Missing history');
    const restored = ContinuityJournal.fromCheckpoint(journal.checkpoint(), { now: () => now });
    now = 119;
    refusal(restored, ref, 'unknown');
    now = 120;
    refusal(restored, ref, 'expired');
    expect(() => restored.issueSpan('p', 7, 13)).toThrow('Coverage incomplete');
    expect(restored.checkpoint().coverage.status).toBe('incomplete');
  });

  it('does not certify a new structural break from packets retained after the missing-history frontier', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    journal.markIncomplete('Earlier accepted steps are missing');
    accepted(journal, doc, tr => split(tr, 10));
    refusal(journal, ref, 'unknown');
    const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    refusal(restored, ref, 'unknown');
    expect(restored.checkpoint().coverage).toEqual({ status: 'incomplete', reason: 'Earlier accepted steps are missing', knownCut: [] });
    expect(restored.checkpoint().packets).toHaveLength(1);
  });

  it('records explicit loss when two concurrent children exceed the remaining admission slot', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    fill(journal, 31);
    const parents = journal.heads(), fork = load(state(doc));
    const a = edit(doc, parents, tr => { tr.insert(3, editor.pmSchema.text('A')); });
    const b = edit(fork, parents, tr => { tr.insert(3, editor.pmSchema.text('B')); });
    journal.accept(a);
    const full = journal.checkpoint();
    expect(() => journal.accept(b)).toThrow('budget exhausted');
    expect(journal.checkpoint()).toEqual(full);
    Y.applyUpdate(doc, Buffer.from(b.update, 'base64'));
    expect(bytes(state(doc))).not.toBe(bytes(journal.currentState()));
    journal.markIncomplete('Concurrent admission exhausted; human update retained outside journal');
    expect(journal.evaluate(ref, state(doc)).status).toBe('unknown');
    const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    expect(restored.checkpoint().packets).toEqual(full.packets);
    // Loss still matters when a later caller supplies only the journal's own bytes.
    expect(restored.evaluate(ref, restored.currentState()).status).toBe('unknown');
    refusal(restored, ref, 'unknown');
  });
});

describe('certified actual undo and redo', () => {
  function undoPacket(doc: Y.Doc, source: ContinuityPacket, parents: string[], undo: Y.UndoManager, kind: 'undo' | 'redo'): ContinuityPacket {
    const sourceDoc = load(Buffer.from(source.before, 'base64'));
    let pm = initProseMirrorDoc(root(sourceDoc), editor.pmSchema).doc;
    const sourceSteps: unknown[] = [];
    for (const json of source.evidence.kind === 'pm' ? source.evidence.steps : source.evidence.sourceSteps) {
      const step = Step.fromJSON(editor.pmSchema, json);
      sourceSteps.unshift(step.invert(pm).toJSON());
      pm = step.apply(pm).doc!;
    }
    const before = bytes(state(doc)), vector = Y.encodeStateVector(doc);
    expect(undo[kind]()).not.toBeNull();
    return { id: `undo-${++sequence}`, parents, before, update: bytes(Y.encodeStateAsUpdate(doc, vector)),
      evidence: { kind, sourceId: source.id, sourceSteps } };
  }

  it('certifies precise ordinary text undo/redo while preserving the original container', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const undo = new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = accepted(journal, doc, tr => { tr.replaceWith(10, 16, editor.pmSchema.text('HUMAN')); });
      const undone = undoPacket(doc, source, journal.heads(), undo, 'undo');
      journal.accept(undone);
      expect(journal.evaluate(ref).status).toBe('safe');
      const redone = undoPacket(doc, undone, journal.heads(), undo, 'redo');
      journal.accept(redone);
      patched(journal, ref, 'before agent after');
    } finally { undo.destroy(); }
  });

  it('certifies the browser deletion/replacement/undo/redo sequence using the original reference after GC reload', () => {
    let { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    accepted(journal, doc, tr => { tr.delete(9, 10); });
    accepted(journal, doc, tr => { tr.delete(15, 16); });
    doc = load(state(doc));
    journal = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
    const undo = new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = accepted(journal, doc, tr => { tr.replaceWith(9, 15, editor.pmSchema.text('HUMAN')); });
      expect(journal.evaluate(ref)).toEqual({ status: 'safe', start: 6, end: 11 });
      const undone = undoPacket(doc, source, journal.heads(), undo, 'undo');
      journal.accept(undone);
      journal = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
      expect(xml(doc).toString()).toBe('beforeTARGETafter');
      expect(journal.evaluate(ref, state(doc))).toEqual({ status: 'safe', start: 6, end: 12 });
      journal.accept(undoPacket(doc, undone, journal.heads(), undo, 'redo'));
      journal = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
      expect(xml(doc).toString()).toBe('beforeHUMANafter');
      expect(journal.evaluate(ref, state(doc))).toEqual({ status: 'safe', start: 6, end: 11 });
      patched(journal, ref, 'beforeagentafter');
    } finally { undo.destroy(); }
  });

  it('does not revive a broken span after undoing its split', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const undo = new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = accepted(journal, doc, tr => split(tr, 10));
      journal.accept(undoPacket(doc, source, journal.heads(), undo, 'undo'));
      refusal(journal, ref, 'broken');
      patched(journal, journal.issueSpan('p', 7, 13), 'before agent after');
    } finally { undo.destroy(); }
  });

  it('keeps a certified historical break through coverage loss, native undo, and reload', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const undo = new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = accepted(journal, doc, tr => split(tr, 10));
      const inner = journal.issueSpan('p', 1, 6);
      const broken = journal.evaluate(ref);
      journal.markIncomplete('Missing later operation');
      journal.accept(undoPacket(doc, source, journal.heads(), undo, 'undo'));
      expect(xml(doc).toString()).toBe('before TARGET after');
      expect(journal.evaluate(ref)).toEqual(broken);
      refusal(journal, inner, 'unknown');
      const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
      expect(restored.evaluate(ref)).toEqual(broken);
      refusal(restored, ref, 'broken');
      expect(() => restored.issueSpan('p', 7, 13)).toThrow('Coverage incomplete');
    } finally { undo.destroy(); }
  });

  it('invalidates a fresh whole-prefix reference when undoing the split imports the suffix', () => {
    const { doc, journal } = setup();
    const undo = new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = accepted(journal, doc, tr => split(tr, 10));
      const whole = journal.issueSpan('p', 0, 10), inner = journal.issueSpan('p', 1, 6);
      journal.accept(undoPacket(doc, source, journal.heads(), undo, 'undo'));
      refusal(journal, whole, 'broken');
      patched(journal, inner, 'bagent TARGET after');
    } finally { undo.destroy(); }
  });

  it('invalidates a newly issued merged passage when undo restores its boundary', () => {
    const { doc, journal } = setup([{ id: 'p', type: 'paragraph', content: 'first' }, { id: 'other', type: 'paragraph', content: 'second' }]);
    const undo = new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = accepted(journal, doc, join);
      const ref = journal.issueSpan('p', 0, 11);
      journal.accept(undoPacket(doc, source, journal.heads(), undo, 'undo'));
      refusal(journal, ref, 'broken');
    } finally { undo.destroy(); }
  });

  it('does not certify undo without an exact source certificate', () => {
    const { doc, journal } = setup();
    const ref = journal.issueSpan('p', 7, 13);
    const packet = edit(doc, [], tr => { tr.replaceWith(10, 16, editor.pmSchema.text('HUMAN')); });
    journal.accept({ ...packet, evidence: { kind: 'undo', sourceSteps: packet.evidence.kind === 'pm' ? packet.evidence.steps : [] } });
    refusal(journal, ref, 'unknown');
  });

  it('does not certify a redo chain whose original undo lacked provenance', () => {
    const { doc, journal } = setup();
    const source = edit(doc, [], tr => { tr.replaceWith(10, 16, editor.pmSchema.text('HUMAN')); });
    const untrusted: ContinuityPacket = { ...source, evidence: { kind: 'undo', sourceSteps: source.evidence.kind === 'pm' ? source.evidence.steps : [] } };
    journal.accept(untrusted);
    const ref = journal.issueSpan('p', 7, 12);
    const reversed = edit(doc, journal.heads(), tr => { tr.replaceWith(10, 15, editor.pmSchema.text('TARGET')); });
    journal.accept({ ...reversed, evidence: { kind: 'redo', sourceId: source.id,
      sourceSteps: reversed.evidence.kind === 'pm' ? reversed.evidence.steps : [] } });
    refusal(journal, ref, 'unknown');
  });

  it('does not certify grouped or intervened undo merely because supplied steps match final text', () => {
    const { doc, journal } = setup();
    const undo = new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) });
    try {
      const source = accepted(journal, doc, tr => { tr.replaceWith(10, 16, editor.pmSchema.text('HUMAN')); });
      undo.stopCapturing();
      const ref = journal.issueSpan('p', 7, 12);
      accepted(journal, doc, tr => { tr.insert(3, editor.pmSchema.text('outside')); });
      // Actual grouped/remote-dependent effects cannot be certified against source's postimage.
      const packet = edit(doc, journal.heads(), tr => { tr.replaceWith(17, 22, editor.pmSchema.text('TARGET')); });
      journal.accept({ ...packet, evidence: { kind: 'undo', sourceId: source.id,
        sourceSteps: packet.evidence.kind === 'pm' ? packet.evidence.steps : [] } });
      refusal(journal, ref, 'unknown');
    } finally { undo.destroy(); }
  });
});
