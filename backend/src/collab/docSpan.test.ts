import { describe, expect, it } from 'bun:test';
import * as Y from 'yjs';
import { BlockNoteEditor } from '@blocknote/core';
import { blocksToYDoc } from '@blocknote/core/yjs';
import { docSchema } from './docSchema';
import { issueSpan, applySpan } from './docSpan';

const editor = BlockNoteEditor.create({ schema: docSchema });
function fixture() {
  const doc = blocksToYDoc(editor, [{ id: 'p', type: 'paragraph', content: 'before TARGET after TARGET' },
    { id: 'q', type: 'paragraph', content: 'outside' }]);
  const texts = [...doc.getXmlFragment('prosemirror').createTreeWalker(node => node instanceof Y.XmlText)] as Y.XmlText[];
  const ref = issueSpan(Y.encodeStateAsUpdate(doc), 'p', 7, 13);
  const patch = () => Y.applyUpdate(doc, applySpan(Y.encodeStateAsUpdate(doc), ref, 'AGENT').update);
  return { doc, text: texts[0]!, outside: texts[1]!, ref, patch };
}
describe('current-state span identity', () => {
  it('replaces the current human replacement, not saved text or another literal match', () => {
    const f = fixture();
    try {
      f.doc.transact(() => { f.text.delete(7, 6); f.text.insert(7, 'human replacement'); });
      f.patch();
      expect(f.text.toString()).toBe('before AGENT after TARGET');
    } finally { f.doc.destroy(); }
  });
  it('survives adjacent character deletion, outside formatting and 150 individual edits', () => {
    const f = fixture();
    try {
      f.text.delete(13, 1); f.text.delete(6, 1);
      for (let i = 0; i < 150; i++) f.outside.insert(f.outside.length, 'x');
      f.outside.format(0, 7, { bold: {} });
      f.patch();
      expect(f.text.toString()).toBe('beforeAGENTafter TARGET');
      expect(f.outside.toDelta().map((run: { insert: string }) => run.insert).join('')).toBe('outside' + 'x'.repeat(150));
    } finally { f.doc.destroy(); }
  });
  it('preserves grouped outside undo and resolves after a binary checkpoint reload', () => {
    const f = fixture();
    const undo = new Y.UndoManager(f.outside);
    try {
      f.outside.insert(7, 'a'); f.outside.insert(8, 'b'); undo.undo();
      const reloaded = new Y.Doc();
      try {
        Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(f.doc));
        const update = applySpan(Y.encodeStateAsUpdate(reloaded), f.ref, 'AGENT').update;
        Y.applyUpdate(f.doc, update);
        expect(f.text.toString()).toBe('before AGENT after TARGET');
        expect(f.outside.toString()).toBe('outside');
      } finally { reloaded.destroy(); }
    } finally { undo.destroy(); f.doc.destroy(); }
  });
  it('rejects a deleted interval without selecting the other occurrence', () => {
    const f = fixture();
    try { f.text.delete(7, 6); expect(f.patch).toThrow('no longer survives'); expect(f.text.toString()).toBe('before  after TARGET'); }
    finally { f.doc.destroy(); }
  });
  it.each([true, false])('never resurrects a deleted block recreated with the same id (gc=%s)', gc => {
    const f = fixture(); f.doc.gc = gc;
    try {
      const block = f.text.parent!.parent as Y.XmlElement;
      const parent = block.parent as Y.XmlElement;
      const index = parent.toArray().indexOf(block);
      const replacement = block.clone();
      parent.delete(index, 1); parent.insert(index, [replacement]);
      expect(f.patch).toThrow('no longer survives');
    } finally { f.doc.destroy(); }
  });
  it('includes boundary insertions but refuses incompatible formatting', () => {
    const f = fixture();
    try {
      f.text.insert(7, '['); f.text.insert(14, ']'); f.patch();
      expect(f.text.toString()).toBe('before AGENT after TARGET');
      const current = issueSpan(Y.encodeStateAsUpdate(f.doc), 'p', 7, 12);
      f.text.format(7, 1, { bold: {} });
      expect(() => applySpan(Y.encodeStateAsUpdate(f.doc), current, 'x')).toThrow('formatting');
    } finally { f.doc.destroy(); }
  });
  it('preserves Unicode scalars and refuses half-surrogate boundaries and replacements', () => {
    const f = fixture();
    try {
      f.doc.transact(() => { f.text.delete(7, 6); f.text.insert(7, '😀'); });
      expect(() => issueSpan(Y.encodeStateAsUpdate(f.doc), 'p', 7, 8)).toThrow('Unicode');
      expect(() => applySpan(Y.encodeStateAsUpdate(f.doc), f.ref, '\ud800')).toThrow('Unicode');
      Y.applyUpdate(f.doc, applySpan(Y.encodeStateAsUpdate(f.doc), f.ref, '🌱').update);
      expect(f.text.toString()).toBe('before 🌱 after TARGET');
    } finally { f.doc.destroy(); }
  });
});
