import { afterEach, describe, expect, it } from 'bun:test';
import * as Y from 'yjs';
import { hasCancelledInsertion } from './docUndoContinuityExperiment';
import type { ContinuityPacket } from './docContinuityExperiment';

const docs: Y.Doc[] = [];
afterEach(() => { for (const doc of docs.splice(0)) doc.destroy(); });
const bytes = (value: Uint8Array) => Buffer.from(value).toString('base64');
function load(value?: Uint8Array) {
  const doc = new Y.Doc();
  docs.push(doc);
  if (value) Y.applyUpdate(doc, value);
  return doc;
}
function fixture(replaceOriginal = false) {
  const doc = load(), text = new Y.XmlText();
  doc.getXmlFragment('prosemirror').insert(0, [text]);
  text.insert(0, 'aaa');
  const packet = (id: string, parents: string[], change: () => void, evidence: ContinuityPacket['evidence']) => {
    const before = bytes(Y.encodeStateAsUpdate(doc)), vector = Y.encodeStateVector(doc);
    change();
    return { id, parents, before, update: bytes(Y.encodeStateAsUpdate(doc, vector)), evidence };
  };
  const source = packet('source', [], () => text.insert(0, 'A'),
    { kind: 'pm', steps: [{ stepType: 'replace', from: 3, to: 3, slice: { content: [{ type: 'text', text: 'A' }] } }] });
  const sourcePost = Y.encodeStateAsUpdate(doc);
  const insertion = packet('insertion', [source.id], () => {
    if (replaceOriginal) { text.delete(2, 1); text.insert(2, 'a'); }
    text.insert(1, 'a');
  }, { kind: 'pm', steps: [{ stepType: 'replace', from: 4, to: 4, slice: { content: [{ type: 'text', text: 'a' }] } }] });
  const undo = packet('undo', [insertion.id], () => text.delete(1, 1),
    { kind: 'undo', sourceId: insertion.id, sourceSteps: [{ stepType: 'replace', from: 4, to: 5 }] });
  const before = bytes(Y.encodeStateAsUpdate(doc));
  const packets = new Map([source, insertion, undo].map(item => [item.id, item]));
  return { source, sourcePost, insertion, undo, before, packets,
    check: () => hasCancelledInsertion(Y, source, sourcePost, before, [undo.id], id => packets.get(id)) };
}

describe('retained insertion/undo certificate', () => {
  it('accepts an exact cancellation despite additional deleted-item history, including GC reload', () => {
    const f = fixture();
    expect(f.before).not.toBe(bytes(f.sourcePost));
    expect(f.check()).toBe(true);
    const restored = load(Buffer.from(f.before, 'base64'));
    expect(hasCancelledInsertion(Y, f.source, f.sourcePost, bytes(Y.encodeStateAsUpdate(restored)),
      [f.undo.id], id => structuredClone(f.packets.get(id)))).toBe(true);
  });

  it('rejects deleting a different identical character instead of the inserted item', () => {
    const f = fixture(), wrong = load(Buffer.from(f.undo.before, 'base64'));
    const vector = Y.encodeStateVector(wrong);
    (wrong.getXmlFragment('prosemirror').get(0) as Y.XmlText).delete(2, 1);
    f.undo.update = bytes(Y.encodeStateAsUpdate(wrong, vector));
    expect(wrong.getXmlFragment('prosemirror').toString()).toBe('Aaaa');
    expect(hasCancelledInsertion(Y, f.source, f.sourcePost, bytes(Y.encodeStateAsUpdate(wrong)),
      [f.undo.id], id => f.packets.get(id))).toBe(false);
  });

  it('rejects an insertion that also deletes and recreates an original identical character', () => {
    expect(fixture(true).check()).toBe(false);
  });

  it.each(['missing', 'wrong-source', 'concurrent', 'wrong-preimage', 'wrong-inverse', 'structural', 'not-undone'])(
    'rejects %s evidence', kind => {
      const f = fixture();
      if (kind === 'missing') f.packets.delete(f.insertion.id);
      if (kind === 'wrong-source' && f.undo.evidence.kind === 'undo') f.undo.evidence.sourceId = f.source.id;
      if (kind === 'concurrent') f.insertion.parents.push('other');
      if (kind === 'wrong-preimage') f.insertion.before = f.before;
      if (kind === 'wrong-inverse' && f.undo.evidence.kind === 'undo') f.undo.evidence.sourceSteps = [{ stepType: 'replace', from: 5, to: 6 }];
      if (kind === 'structural' && f.insertion.evidence.kind === 'pm') f.insertion.evidence.steps.push({ stepType: 'replace', from: 1, to: 1 });
      if (kind === 'not-undone') f.undo.update = bytes(new Uint8Array([0, 0]));
      expect(f.check()).toBe(false);
    },
  );
});
