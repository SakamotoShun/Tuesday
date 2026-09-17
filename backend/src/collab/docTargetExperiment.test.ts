import { afterEach, describe, expect, it } from 'bun:test';
// Historical, rejected witness resolver. The eight `it.failing` cases preserve
// its known counterexamples; an unexpected pass requires revisiting that record.
// Production current-state semantics are tested separately in docSpan.test.ts.
import { BlockNoteEditor, updateBlock, type PartialBlock } from '@blocknote/core';
import { blocksToYDoc } from '@blocknote/core/yjs';
import { Transform } from 'prosemirror-transform';
import { EditorState } from 'prosemirror-state';
import { CellSelection, mergeCells } from 'prosemirror-tables';
import { initProseMirrorDoc, updateYFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { docTargetSchema } from './docTargetSchema';
import {
  applyTargetPatch,
  DocTargetError,
  encodeContainerIdentity,
  inspectTargets,
  issueTextSpan,
  resolveExperimentalTarget,
  type BlockTargetRef,
  type TargetInlineContent,
  type TargetPatchOperation,
  type TextTargetRef,
} from './docTargetExperiment';
import { MAX_DOC_CONTENT_BYTES } from '../utils/doc-blocks';
import { materializeDocHistory, MAX_COLLAB_SYNC_UPDATES, MAX_DOC_SYNC_PAYLOAD_BYTES } from './docHistory';

const editor = BlockNoteEditor.create({ schema: docTargetSchema });
const documents: Y.Doc[] = [];
afterEach(() => {
  for (const doc of documents.splice(0)) doc.destroy();
});

function seed(blocks: PartialBlock[] = [{ id: 'p', type: 'paragraph', content: 'before TARGET after' }]): Y.Doc {
  const doc = blocksToYDoc(editor, blocks);
  documents.push(doc);
  return doc;
}

function load(state: Uint8Array, gc = true): Y.Doc {
  const doc = new Y.Doc({ gc });
  documents.push(doc);
  Y.applyUpdate(doc, state);
  return doc;
}

const state = (doc: Y.Doc) => Y.encodeStateAsUpdate(doc);
const bytes = (value: Uint8Array) => Buffer.from(value).toString('base64');
const nodes = (doc: Y.Doc) => Array.from(doc.getXmlFragment('prosemirror').createTreeWalker(() => true));
const block = (doc: Y.Doc, id = 'p') => nodes(doc).find(
  (node): node is Y.XmlElement => node instanceof Y.XmlElement && node.getAttribute('id') === id,
)!;
const text = (doc: Y.Doc, id = 'p') => Array.from(block(doc, id).get(0) instanceof Y.XmlElement
  ? (block(doc, id).get(0) as Y.XmlElement).createTreeWalker((node) => node instanceof Y.XmlText)
  : [])[0] as Y.XmlText;
const plain = (value: Y.XmlText) => value.toDelta().map((part: { insert: string }) => part.insert).join('');
const target = (doc: Y.Doc, id = 'p') => inspectTargets(state(doc)).find((entry) => entry.blockId === id)!;
const fullSpan = (doc: Y.Doc, id = 'p') => target(doc, id).spans[0].targetRef;
const precise = (doc: Y.Doc, from: number, to: number, id = 'p') => issueTextSpan(state(doc), fullSpan(doc, id), from, to);
const replacement = (targetRef: TextTargetRef, value: string): TargetPatchOperation => ({ type: 'replace_text', targetRef, text: value });
const bodyReplacement = (targetRef: BlockTargetRef, value: string): TargetPatchOperation => ({
  type: 'replace_body', targetRef, content: value ? [{ type: 'text', text: value, styles: {} }] : [],
});
const characterIds = (value: Y.XmlText) => Array.from({ length: value.length }, (_, index) =>
  Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(value, index, 0)).item);

function patch(doc: Y.Doc, operations: TargetPatchOperation[]) {
  const input = state(doc);
  const original = bytes(input);
  const result = applyTargetPatch(input, operations);
  expect(bytes(input)).toBe(original);
  expect(bytes(state(doc))).toBe(original);
  Y.applyUpdate(doc, result.update);
  return result;
}

function reject(doc: Y.Doc, operations: unknown, code: DocTargetError['code']) {
  const input = state(doc);
  const original = bytes(input);
  try {
    applyTargetPatch(input, operations as TargetPatchOperation[]);
    throw new Error('Expected patch rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(DocTargetError);
    expect((error as DocTargetError).code).toBe(code);
  }
  expect(bytes(input)).toBe(original);
  expect(bytes(state(doc))).toBe(original);
}

function pmEdit(doc: Y.Doc, edit: (tr: Transform) => void) {
  const root = doc.getXmlFragment('prosemirror');
  const initialized = initProseMirrorDoc(root, editor.pmSchema);
  const tr = new Transform(initialized.doc);
  edit(tr);
  tr.doc.check();
  updateYFragment(doc, root, tr.doc, initialized.meta);
}

describe('experimental target identity on real BlockNote XML', () => {
  it('exposes the browser API with serializable references and actual parity schema defaults', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'hello' },
      { id: 'code', type: 'codeBlock', content: 'const x = 1' },
    ]);
    const inspected = JSON.parse(JSON.stringify(inspectTargets(state(doc))));
    expect(inspected[0]).toMatchObject({ blockId: 'p', spans: [{ text: 'hello' }] });
    expect(editor.pmSchema.nodes.codeBlock.spec.attrs?.language.default).toBe('javascript');
    const result = patch(doc, [replacement(inspected[0].spans[0].targetRef, 'world')]);
    expect(result.blocks[0].content).toEqual([{ type: 'text', text: 'world', styles: {} }]);
    expect(result.blocks[1].props.language).toBe('javascript');
  });

  it('encodes the nested type, not its child, for both block and XmlText', () => {
    const doc = seed();
    for (const container of [block(doc), text(doc)]) {
      const encoded = encodeContainerIdentity(container);
      const relative = Y.decodeRelativePosition(Buffer.from(encoded, 'base64'));
      expect(relative.type).not.toBeNull();
      expect(relative.item).toBeNull();
      expect(relative.tname).toBeNull();
      expect(relative.assoc).toBe(-1);
      const restored = load(state(doc));
      const absolute = Y.createAbsolutePositionFromRelativePosition(relative, restored, false)!;
      expect(absolute.index).toBe(0);
      expect(encodeContainerIdentity(absolute.type as Y.XmlElement | Y.XmlText)).toBe(encoded);
    }
  });

  it.failing('retains references through binary checkpoints, reloads, unrelated deletions, and default GC', () => {
    let doc = seed([
      { id: 'p', type: 'paragraph', content: 'target' },
      { id: 'gone', type: 'paragraph', content: 'discard' },
    ]);
    const ref = fullSpan(doc);
    for (let pass = 0; pass < 4; pass++) {
      const vector = Y.encodeStateVector(doc);
      text(doc).insert(0, String(pass));
      const update = Y.encodeStateAsUpdate(doc, vector);
      expect(update.byteLength).toBeGreaterThan(0);
      if (pass === 0) (block(doc).parent as Y.XmlElement).delete(1, 1);
      doc = load(state(doc));
      expect(doc.gc).toBe(true);
      const resolved = resolveExperimentalTarget(doc, ref);
      expect(resolved.text).toBe(text(doc));
      expect(encodeContainerIdentity(resolved.block)).toBe(ref.block.container);
    }
    patch(doc, [replacement(ref, 'patched')]);
    expect(plain(text(doc))).toBe('patched');
  });

  it('rejects non-GC deleted containers even when public relative resolution is non-null', () => {
    const doc = load(state(seed()), false);
    const ref = fullSpan(doc);
    (block(doc).parent as Y.XmlElement).delete(0, 1);
    for (const encoded of [ref.block.container, ref.container]) {
      const resolved = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(Buffer.from(encoded, 'base64')), doc, false);
      expect(resolved).not.toBeNull();
      expect(nodes(doc)).not.toContain(resolved!.type);
    }
    const before = bytes(state(doc));
    expect(() => resolveExperimentalTarget(doc, ref)).toThrow('Block container no longer survives');
    expect(bytes(state(doc))).toBe(before);
  });

  it('rejects a retained deleted XmlText without rejecting its still-live block body', () => {
    const doc = load(state(seed()), false);
    const ref = fullSpan(doc);
    (text(doc).parent as Y.XmlElement).delete(0, 1);
    const relative = Y.decodeRelativePosition(Buffer.from(ref.container, 'base64'));
    expect(Y.createAbsolutePositionFromRelativePosition(relative, doc, false)).not.toBeNull();
    const before = bytes(state(doc));
    expect(() => resolveExperimentalTarget(doc, ref)).toThrow('Inline container no longer survives');
    expect(resolveExperimentalTarget(doc, ref.block).block).toBe(block(doc));
    expect(bytes(state(doc))).toBe(before);
  });

  it('preserves identities across a real bounded replay checkpoint and trailing updates', () => {
    const source = seed([
      { id: 'p', type: 'paragraph', content: 'unchanged' },
      { id: 'churn', type: 'paragraph', content: 'churn' },
    ]);
    const baseline = state(source);
    const ref = fullSpan(source);
    const originalCharacters = characterIds(text(source));
    const updates: Uint8Array[] = [];
    source.on('update', (update: Uint8Array) => updates.push(update));
    for (let index = 0; index < MAX_COLLAB_SYNC_UPDATES + 5; index++) {
      source.transact(() => {
        const value = text(source, 'churn');
        value.delete(0, value.length);
        value.insert(0, String(index));
      });
    }
    expect(updates).toHaveLength(MAX_COLLAB_SYNC_UPDATES + 5);
    const prefix = materializeDocHistory(baseline, updates.slice(0, MAX_COLLAB_SYNC_UPDATES));
    documents.push(prefix);
    const checkpoint = state(prefix);
    const restored = materializeDocHistory(checkpoint, updates.slice(MAX_COLLAB_SYNC_UPDATES));
    documents.push(restored);
    expect(bytes(state(restored))).toBe(bytes(state(source)));
    expect(characterIds(text(restored))).toEqual(originalCharacters);
    expect(resolveExperimentalTarget(restored, ref).text).toBe(text(restored));
    patch(restored, [replacement(ref, 'after checkpoint')]);
    expect(plain(text(restored, 'churn'))).toBe(String(MAX_COLLAB_SYNC_UPDATES + 4));
  });

  it('rejects deleted ancestry and same-ID recreation rather than retargeting a neighbor', () => {
    const doc = seed([
      { id: 'parent', type: 'paragraph', content: 'parent', children: [{ id: 'p', type: 'paragraph', content: 'original' }] },
      { id: 'neighbor', type: 'paragraph', content: 'neighbor' },
    ]);
    const ref = fullSpan(doc);
    const parent = block(doc, 'parent');
    const group = parent.parent as Y.XmlElement;
    const clone = parent.clone();
    doc.transact(() => { group.delete(0, 1); group.insert(0, [clone]); });
    reject(doc, [replacement(ref, 'wrong')], 'TARGET_GONE');
    expect(plain(text(doc))).toBe('original');
    expect(plain(text(doc, 'neighbor'))).toBe('neighbor');
  });

  it('rejects delete/reinsert moves and does not follow local undo recreation', () => {
    const doc = load(state(seed([
      { id: 'p', type: 'paragraph', content: 'original' },
      { id: 'neighbor', type: 'paragraph', content: 'neighbor' },
    ])), false);
    const ref = fullSpan(doc);
    const root = doc.getXmlFragment('prosemirror');
    const undo = new Y.UndoManager(root);
    const original = block(doc);
    const group = original.parent as Y.XmlElement;
    group.delete(0, 1);
    undo.undo();
    const relative = Y.decodeRelativePosition(Buffer.from(ref.block.container, 'base64'));
    expect(Y.createAbsolutePositionFromRelativePosition(relative, doc, true)?.type).toBe(block(doc));
    expect(Y.createAbsolutePositionFromRelativePosition(relative, doc, false)?.type).toBe(original);
    expect(() => resolveExperimentalTarget(doc, ref)).toThrow('Block container no longer survives');
    undo.destroy();
    const current = fullSpan(doc);
    const moved = block(doc).clone();
    doc.transact(() => { group.delete(0, 1); group.insert(1, [moved]); });
    reject(doc, [replacement(current, 'wrong')], 'TARGET_GONE');
  });

  it('rejects a deleted/recreated inline container even if its block survives', () => {
    const doc = seed();
    const ref = fullSpan(doc);
    const body = text(doc).parent as Y.XmlElement;
    const clone = text(doc).clone();
    doc.transact(() => { body.delete(0, 1); body.insert(0, [clone]); });
    reject(doc, [replacement(ref, 'wrong')], 'TARGET_GONE');
    patch(doc, [bodyReplacement(ref.block, 'body still survives')]);
    expect(plain(text(doc))).toBe('body still survives');
  });

  it('rejects wrong IDs, foreign containers, crossed endpoints, and malformed reference bytes', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'abcd' },
      { id: 'other', type: 'paragraph', content: 'efgh' },
    ]);
    const ref = precise(doc, 1, 3);
    reject(doc, [replacement({ ...ref, block: { ...ref.block, blockId: 'other' } }, 'x')], 'TARGET_UNRESOLVABLE');
    reject(doc, [replacement({ ...ref, container: fullSpan(doc, 'other').container }, 'x')], 'TARGET_UNRESOLVABLE');
    const encode = (index: number, assoc: number) => bytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text(doc), index, assoc)));
    reject(doc, [replacement({ ...ref, start: encode(3, -1), end: encode(1, 0) }, 'x')], 'TARGET_UNRESOLVABLE');
    reject(doc, [replacement({ ...ref, start: encode(1, 0) }, 'x')], 'INVALID_REFERENCE');
    reject(doc, [replacement({ ...ref, container: '!!!!' }, 'x')], 'INVALID_REFERENCE');
    reject(doc, [replacement({ ...ref, container: bytes(new Uint8Array([...Buffer.from(ref.container, 'base64'), 0])) }, 'x')], 'INVALID_REFERENCE');
    const independent = seed([{ id: 'p', type: 'paragraph', content: 'abcd' }]);
    reject(independent, [replacement(ref, 'x')], 'TARGET_GONE');
  });
});

describe('exact text edits and actual BlockNote replacement boundaries', () => {
  it('deletes the first a from aaa while preserving original second/third character identities', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'aaa' }]);
    const original = characterIds(text(doc));
    const result = patch(doc, [replacement(precise(doc, 0, 1), '')]);
    expect(plain(text(doc))).toBe('aa');
    expect(characterIds(text(doc))).toEqual(original.slice(1));
    expect(result.update.byteLength).toBeGreaterThan(0);
  });

  it('demonstrates why updateYFragment final-string reconciliation is not the text adapter', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'aaa' }]);
    const original = characterIds(text(doc));
    pmEdit(doc, (tr) => tr.delete(3, 4));
    expect(plain(text(doc))).toBe('aa');
    expect(characterIds(text(doc))).toEqual(original.slice(0, 2));
  });

  it('applies two disjoint edits right-to-left and preserves delayed outside edits to the intended characters', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'aa MIDDLE zz' }]);
    const delayed = load(state(doc));
    const originalIds = characterIds(text(doc));
    const beforeHuman = Y.encodeStateVector(delayed);
    text(delayed).delete(4, 1);
    const delayedUpdate = Y.encodeStateAsUpdate(delayed, beforeHuman);
    const result = patch(doc, [replacement(precise(doc, 0, 2), 'LEFT'), replacement(precise(doc, 10, 12), 'RIGHT')]);
    expect(plain(text(doc))).toBe('LEFT MIDDLE RIGHT');
    expect(characterIds(text(doc)).slice(4, 12)).toEqual(originalIds.slice(2, 10));
    Y.applyUpdate(doc, delayedUpdate);
    Y.applyUpdate(delayed, result.update);
    expect(plain(text(doc))).toBe('LEFT MDDLE RIGHT');
    expect(plain(text(delayed))).toBe(plain(text(doc)));
    expect(bytes(state(delayed))).toBe(bytes(state(doc)));
  });

  it('preserves late inserts and formatting outside the selected phrase', () => {
    const doc = seed();
    const delayed = load(state(doc));
    const vector = Y.encodeStateVector(delayed);
    delayed.transact(() => {
      text(delayed).format(0, 6, { bold: {} });
      text(delayed).insert(text(delayed).length, ' offline');
    });
    const human = Y.encodeStateAsUpdate(delayed, vector);
    const result = patch(doc, [replacement(precise(doc, 7, 13), 'agent')]);
    Y.applyUpdate(doc, human);
    Y.applyUpdate(delayed, result.update);
    expect(plain(text(doc))).toBe('before agent after offline');
    expect(text(doc).toDelta()[0]).toEqual({ insert: 'before', attributes: { bold: {} } });
    expect(bytes(state(doc))).toBe(bytes(state(delayed)));
  });

  it('overwrites the current outward interval after a mapped ProseMirror phrase replacement', () => {
    const doc = seed();
    const ref = precise(doc, 7, 13);
    pmEdit(doc, (tr) => tr.replaceWith(10, 16, editor.pmSchema.text('REPLACED')));
    const resolved = resolveExperimentalTarget(doc, ref);
    expect([resolved.start, resolved.end]).toEqual([7, 15]);
    expect(plain(text(doc)).slice(resolved.start, resolved.end)).toBe('REPLACED');
    patch(doc, [replacement(ref, 'agent')]);
    expect(plain(text(doc))).toBe('before agent after');
  });

  it('overwrites the current body after the exported BlockNote updateBlock helper replaces it', () => {
    const doc = seed();
    const ref = fullSpan(doc);
    pmEdit(doc, (tr) => { updateBlock(tr, 'p', { content: 'entirely new body' }); });
    const current = resolveExperimentalTarget(doc, ref);
    expect([current.start, current.end]).toEqual([0, 'entirely new body'.length]);
    patch(doc, [replacement(ref, 'agent')]);
    expect(plain(text(doc))).toBe('agent');
  });

  it.each(['same transaction', 'separate transactions'])('includes delete-then-insert and boundary insertions: %s', (mode) => {
    const doc = seed();
    const ref = precise(doc, 7, 13);
    const replace = () => { text(doc).delete(7, 6); text(doc).insert(7, 'human'); };
    if (mode === 'same transaction') doc.transact(replace);
    else replace();
    text(doc).insert(7, 'L');
    text(doc).insert(13, 'R');
    const resolved = resolveExperimentalTarget(doc, ref);
    expect(plain(text(doc)).slice(resolved.start, resolved.end)).toBe('LhumanR');
    patch(doc, [replacement(ref, 'agent')]);
    expect(plain(text(doc))).toBe('before agent after');
  });

  it('rejects a collapsed former span but permits intentional body replacement', () => {
    const doc = seed();
    const ref = fullSpan(doc);
    pmEdit(doc, (tr) => { updateBlock(tr, 'p', { content: [] }); });
    expect(text(doc).length).toBe(0);
    expect(encodeContainerIdentity(text(doc))).toBe(ref.container);
    reject(doc, [replacement(ref, 'must not insert')], 'TARGET_GONE');
    patch(doc, [bodyReplacement(ref.block, 'intentional body')]);
    expect(plain(text(doc))).toBe('intentional body');
  });

  it('rejects spans lost by a BlockNote type conversion or a split of the selected suffix', () => {
    const doc = seed();
    const ref = fullSpan(doc);
    pmEdit(doc, (tr) => { updateBlock(tr, 'p', { type: 'heading', props: { level: 2 } }); });
    reject(doc, [replacement(ref, 'wrong type')], 'TARGET_UNRESOLVABLE');
    const split = seed();
    const suffix = precise(split, 7, 19);
    pmEdit(split, (tr) => tr.split(10, 2));
    // Split creates a new block with no ID until the browser UniqueID plugin runs.
    const containers = nodes(split).filter((node): node is Y.XmlElement => node instanceof Y.XmlElement && node.nodeName === 'blockContainer');
    containers[1].setAttribute('id', 'split');
    reject(split, [replacement(suffix, 'must not recreate')], 'TARGET_GONE');
  });

  it('rejects the deleted block identity after a mapped ProseMirror block merge', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    const ref = fullSpan(doc, 'other');
    pmEdit(doc, (tr) => {
      const firstBlock = tr.doc.firstChild!.firstChild!;
      tr.join(1 + firstBlock.nodeSize, 2);
    });
    reject(doc, [replacement(ref, 'must not target the merged block')], 'TARGET_GONE');
    expect(plain(text(doc))).toBe('firstsecond');
  });
});

// Ordinary assertions deliberately expose the rejected candidate's contract failures.
// Do not turn these into expected failures or relax permitted edits to obtain green tests.
describe('milestone 1A: span continuity acceptance against the revision-3 candidate', () => {
  function splitThroughTarget() {
    const doc = seed();
    const ref = precise(doc, 7, 13);
    pmEdit(doc, (tr) => tr.split(13, 2)); // before TAR|GET after
    const containers = nodes(doc).filter((node): node is Y.XmlElement => node instanceof Y.XmlElement && node.nodeName === 'blockContainer');
    // Stand in for the browser UniqueID plugin, as in the displaced-suffix fixture.
    containers[1].setAttribute('id', 'split');
    return { doc, ref };
  }

  function mergeIntoTarget() {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    const ref = fullSpan(doc);
    pmEdit(doc, (tr) => tr.join(1 + tr.doc.firstChild!.firstChild!.nodeSize, 2));
    return { doc, ref };
  }

  it('issues character witnesses inside text and inline-container witnesses at container boundaries', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    expect(precise(doc, 1, 4)).toMatchObject({ before: 'anchor', after: 'anchor' });
    expect(fullSpan(doc)).toMatchObject({ before: 'none', after: encodeContainerIdentity(text(doc, 'other')) });
    expect(fullSpan(doc, 'other')).toMatchObject({ before: encodeContainerIdentity(text(doc)), after: 'none' });
    expect(precise(doc, 0, 2)).toMatchObject({ before: 'none', after: 'anchor' });
  });

  it('rejects a split through TAR|GET with the first container surviving, leaving both blocks intact', () => {
    const { doc, ref } = splitThroughTarget();
    expect(plain(text(doc))).toBe('before TAR');
    expect(plain(text(doc, 'split'))).toBe('GET after');
    reject(doc, [replacement(ref, 'agent')], 'TARGET_UNRESOLVABLE');
    expect(() => resolveExperimentalTarget(doc, ref)).toThrow('character after the span');
  });

  it('rejects a merge into the first surviving container instead of consuming the merged paragraph', () => {
    const { doc, ref } = mergeIntoTarget();
    expect(plain(text(doc))).toBe('firstsecond');
    reject(doc, [replacement(ref, 'agent')], 'TARGET_UNRESOLVABLE');
    expect(() => resolveExperimentalTarget(doc, ref)).toThrow('inline container after the span');
  });

  it.failing('accepts deletion of the adjacent prefix character', () => {
    const doc = seed();
    const ref = precise(doc, 7, 13);
    const original = text(doc);
    text(doc).delete(6, 1);
    patch(doc, [replacement(ref, 'agent')]);
    expect(text(doc)).toBe(original);
    expect(plain(text(doc))).toBe('beforeagent after');
  });

  it('rejects a preceding container merged into a surviving second container', () => {
    const merged = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    const suffix = precise(merged, 0, 3, 'other');
    // Model a reconciler that keeps the second container and prepends the first paragraph's text.
    merged.transact(() => {
      text(merged, 'other').insert(0, 'first');
      (block(merged).parent as Y.XmlElement).delete((block(merged).parent as Y.XmlElement).toArray().indexOf(block(merged)), 1);
    });
    expect(plain(text(merged, 'other'))).toBe('firstsecond');
    reject(merged, [replacement(suffix, 'agent')], 'TARGET_UNRESOLVABLE');
  });

  it('rejects joining inline segments across a hard break', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'left\nright' }]);
    const [left, right] = target(doc).spans.map((span) => span.targetRef);
    pmEdit(doc, (tr) => tr.replaceWith(3 + 'left'.length, 3 + 'left'.length + 1, []));
    expect(target(doc).spans.map((span) => span.text)).toEqual(['leftright']);
    reject(doc, [replacement(left, 'agent')], 'TARGET_UNRESOLVABLE');
    reject(doc, [replacement(right, 'agent')], 'TARGET_GONE');
  });

  it('accepts splits and merges outside the target while its container survives', () => {
    const afterTarget = seed();
    const ref = precise(afterTarget, 7, 13);
    pmEdit(afterTarget, (tr) => {
      tr.split(3 + 'before TARGET af'.length, 2);
      const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
      tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, id: 'split' });
    });
    patch(afterTarget, [replacement(ref, 'agent')]);
    expect(plain(text(afterTarget))).toBe('before agent af');
    const enterAtEnd = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    const whole = fullSpan(enterAtEnd);
    pmEdit(enterAtEnd, (tr) => {
      tr.split(3 + 'first'.length, 2);
      const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
      tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, id: 'split' });
    });
    patch(enterAtEnd, [replacement(whole, 'agent')]);
    expect(plain(text(enterAtEnd))).toBe('agent');
    expect(plain(text(enterAtEnd, 'other'))).toBe('second');
    const midText = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    const inner = precise(midText, 1, 4);
    pmEdit(midText, (tr) => tr.join(1 + tr.doc.firstChild!.firstChild!.nodeSize, 2));
    patch(midText, [replacement(inner, 'IRS')]);
    expect(plain(text(midText))).toBe('fIRStsecond');
  });

  it('accepts whole-span replacement and outward boundary insertions', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    const ref = fullSpan(doc);
    pmEdit(doc, (tr) => tr.replaceWith(3, 3 + 'first'.length, editor.pmSchema.text('REPLACED')));
    text(doc).insert(text(doc).length, ' typed');
    const resolved = resolveExperimentalTarget(doc, ref);
    expect(plain(text(doc)).slice(resolved.start, resolved.end)).toBe('REPLACED typed');
    patch(doc, [replacement(ref, 'agent')]);
    expect(plain(text(doc))).toBe('agent');
  });

  it.failing('accepts deletion of the unrelated suffix', () => {
    const suffix = seed();
    const ref = precise(suffix, 7, 13);
    const original = text(suffix);
    pmEdit(suffix, (tr) => tr.delete(3 + 'before TARGET'.length, 3 + 'before TARGET after'.length)); // deletes the witness space
    expect(plain(text(suffix))).toBe('before TARGET');
    patch(suffix, [replacement(ref, 'agent')]);
    expect(text(suffix)).toBe(original);
    expect(plain(text(suffix))).toBe('before agent');
  });

  it.failing.each(['before', 'after'])('accepts deletion of an unrelated paragraph %s the target', (side) => {
    const nextParagraph = seed([
      { id: 'p', type: 'paragraph', content: 'first' },
      { id: 'other', type: 'paragraph', content: 'second' },
    ]);
    const targetId = side === 'before' ? 'other' : 'p';
    const whole = fullSpan(nextParagraph, targetId);
    const original = text(nextParagraph, targetId);
    pmEdit(nextParagraph, (tr) => {
      const first = tr.doc.firstChild!.firstChild!;
      if (side === 'before') tr.delete(1, 1 + first.nodeSize);
      else tr.delete(1 + first.nodeSize, 1 + first.nodeSize + tr.doc.firstChild!.child(1).nodeSize);
    });
    expect(nodes(nextParagraph).filter((node) => node instanceof Y.XmlElement && node.nodeName === 'blockContainer')).toHaveLength(1);
    patch(nextParagraph, [replacement(whole, 'agent')]);
    expect(text(nextParagraph, targetId)).toBe(original);
    expect(plain(text(nextParagraph, targetId))).toBe('agent');
  });

  it.failing('rejects a whole-span TAR|GET split even without an outside character witness', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'TARGET' }]);
    const ref = fullSpan(doc);
    const original = text(doc);
    pmEdit(doc, (tr) => {
      tr.split(6, 2);
      const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
      tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, id: 'split' });
    });
    expect(text(doc)).toBe(original);
    expect(plain(text(doc))).toBe('TAR');
    expect(plain(text(doc, 'split'))).toBe('GET');
    reject(doc, [replacement(ref, 'agent')], 'TARGET_UNRESOLVABLE');
  });

  it.failing('rejects text merged from a following container created after issuance', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'first' }]);
    const ref = fullSpan(doc);
    expect(ref.after).toBe('none');
    pmEdit(doc, (tr) => tr.split(3 + 'first'.length, 2));
    const containers = nodes(doc).filter((node): node is Y.XmlElement => node instanceof Y.XmlElement && node.nodeName === 'blockContainer');
    containers[1].setAttribute('id', 'created');
    pmEdit(doc, (tr) => tr.insert(1 + tr.doc.firstChild!.firstChild!.nodeSize + 2, editor.pmSchema.text('typed')));
    pmEdit(doc, (tr) => tr.join(1 + tr.doc.firstChild!.firstChild!.nodeSize, 2));
    expect(plain(text(doc))).toBe('firsttyped');
    reject(doc, [replacement(ref, 'agent')], 'TARGET_UNRESOLVABLE');
  });

  it.failing('rejects text imported from a new preceding container into the original XmlText', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'first' }]);
    const ref = fullSpan(doc);
    const original = text(doc);
    pmEdit(doc, (tr) => {
      const first = tr.doc.firstChild!.firstChild!;
      tr.insert(1, first.type.create({ ...first.attrs, id: 'created' },
        first.firstChild!.type.create(first.firstChild!.attrs, editor.pmSchema.text('typed'))));
    });
    // Explicitly model the mirrored reconciliation which retains the second XmlText.
    // Actual keyboard behaviour is measured separately in the browser capture experiment.
    doc.transact(() => {
      text(doc).insert(0, plain(text(doc, 'created')));
      (block(doc).parent as Y.XmlElement).delete(0, 1);
    });
    expect(text(doc)).toBe(original);
    expect(plain(text(doc))).toBe('typedfirst');
    reject(doc, [replacement(ref, 'agent')], 'TARGET_UNRESOLVABLE');
  });

  it('rejects witnesses that contradict their endpoint encoding or point at a non-inline node', () => {
    const doc = seed();
    const ref = precise(doc, 7, 13);
    const whole = fullSpan(doc);
    reject(doc, [replacement({ ...ref, after: 'none' }, 'x')], 'INVALID_REFERENCE');
    reject(doc, [replacement({ ...ref, before: whole.container }, 'x')], 'INVALID_REFERENCE');
    reject(doc, [replacement({ ...whole, before: 'anchor' }, 'x')], 'INVALID_REFERENCE');
    reject(doc, [replacement({ ...whole, after: encodeContainerIdentity(block(doc)) }, 'x')], 'TARGET_UNRESOLVABLE');
    reject(doc, [replacement({ ...whole, after: 'not base64!' }, 'x')], 'INVALID_REFERENCE');
    reject(doc, [{ type: 'replace_text', targetRef: { kind: 'text', block: whole.block, container: whole.container, start: whole.start, end: whole.end }, text: 'x' }], 'INVALID_PATCH');
  });
});

describe('body edits and preservation of rich content', () => {
  it.each([false, true])('rejects merged multi-paragraph cells without changing history (header: %s)', (header) => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'target' },
      { id: 'table', type: 'table', content: { type: 'tableContent', headerRows: header ? 1 : undefined, rows: [
        { cells: ['A', [{ type: 'text', text: 'B', styles: { bold: true } }]] },
      ] } },
    ]);
    const ref = fullSpan(doc);
    const root = doc.getXmlFragment('prosemirror');
    const initialized = initProseMirrorDoc(root, editor.pmSchema);
    const cells: number[] = [];
    initialized.doc.descendants((node, pos) => {
      if (node.type.name === (header ? 'tableHeader' : 'tableCell')) cells.push(pos);
    });
    expect(cells).toHaveLength(2);
    const pm = EditorState.create({ doc: initialized.doc, selection: CellSelection.create(initialized.doc, cells[0], cells[1]) });
    expect(mergeCells(pm, (tr) => {
      tr.doc.check();
      tr.doc.descendants((node) => {
        if (node.type.name === (header ? 'tableHeader' : 'tableCell')) {
          expect(node.childCount).toBe(2);
          expect(node.textBetween(0, node.content.size, '\n')).toBe('A\nB');
          expect(node.child(1).firstChild?.marks.map((mark) => mark.type.name)).toEqual(['bold']);
        }
      });
      updateYFragment(doc, root, tr.doc, initialized.meta);
    })).toBe(true);
    const cellTexts = nodes(doc).filter((node): node is Y.XmlText => node instanceof Y.XmlText && node !== text(doc));
    const identities = cellTexts.map(characterIds);
    expect(() => inspectTargets(state(doc))).toThrow('Multi-paragraph table cells');
    reject(doc, [replacement(ref, 'agent')], 'NORMALIZATION');
    expect(cellTexts.map(characterIds)).toEqual(identities);
    expect(plain(text(doc))).toBe('target');
  });

  it('rejects an outside embed arriving after target issuance without coercion or mutation', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'target' },
      { id: 'other', type: 'paragraph', content: 'outside' },
    ]);
    const ref = fullSpan(doc);
    const outside = text(doc, 'other');
    outside.insertEmbed(3, { kind: 'embed' });
    const expected = [{ insert: 'out' }, { insert: { kind: 'embed' } }, { insert: 'side' }];
    expect(outside.toDelta()).toEqual(expected);
    expect(() => inspectTargets(state(doc))).toThrow('Embedded text values are unsupported');
    reject(doc, [replacement(ref, 'agent')], 'TARGET_UNRESOLVABLE');
    expect(outside.toDelta()).toEqual(expected);
    expect(plain(text(doc))).toBe('target');
  });

  it('creates an XmlText only inside the surviving empty body and preserves children/properties', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', props: { textAlignment: 'center' }, content: [], children: [
      { id: 'child', type: 'paragraph', content: 'child' },
    ] }]);
    const inspected = target(doc);
    const parent = block(doc);
    const body = parent.get(0) as Y.XmlElement;
    const child = block(doc, 'child');
    expect(inspected.spans).toEqual([]);
    expect(body.length).toBe(0);
    const result = patch(doc, [bodyReplacement(inspected.blockRef, 'created')]);
    expect(block(doc)).toBe(parent);
    expect(parent.get(0)).toBe(body);
    expect(block(doc, 'child')).toBe(child);
    expect(result.blocks[0]).toMatchObject({ props: { textAlignment: 'center' }, children: [{ id: 'child' }] });
    const textIdentity = encodeContainerIdentity(text(doc));
    patch(doc, [bodyReplacement(inspected.blockRef, '')]);
    expect(encodeContainerIdentity(text(doc))).toBe(textIdentity);
    expect(target(doc).spans).toEqual([]);
    patch(doc, [bodyReplacement(inspected.blockRef, 'again')]);
    expect(encodeContainerIdentity(text(doc))).toBe(textIdentity);
  });

  it('replaces bodies with explicit typed styles and links without changing the existing containers', () => {
    const doc = seed();
    const bodyRef = target(doc).blockRef;
    const identity = encodeContainerIdentity(text(doc));
    const content: TargetInlineContent[] = [
      { type: 'text' as const, text: 'Bold ', styles: { bold: true } },
      { type: 'link' as const, href: 'https://example.com', content: [{ type: 'text' as const, text: 'link', styles: { italic: true } }] },
      { type: 'text' as const, text: ' plain', styles: {} },
    ];
    const result = patch(doc, [{ type: 'replace_body', targetRef: bodyRef, content }]);
    expect(result.blocks[0].content).toEqual(content);
    expect(encodeContainerIdentity(text(doc))).toBe(identity);
    const inspected = target(doc);
    expect(inspected.spans.map((span) => span.text)).toEqual(['Bold ', 'link', ' plain']);
    patch(doc, [replacement(inspected.spans[1].targetRef, 'changed')]);
    expect(text(doc).toDelta().map((part: { insert: string }) => part.insert)).toEqual(['Bold ', 'changed', ' plain']);
    expect(text(doc).toDelta()[2].attributes).toBeUndefined();
  });

  it('inherits only target marks and preserves outside marks and character IDs', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: [
      { type: 'text', text: 'left ', styles: { bold: true } },
      { type: 'text', text: 'target', styles: {} },
      { type: 'text', text: ' right', styles: { italic: true } },
    ] }]);
    const original = characterIds(text(doc));
    const spans = target(doc).spans;
    patch(doc, [replacement(spans[1].targetRef, 'X')]);
    expect(text(doc).toDelta()).toEqual([
      { insert: 'left ', attributes: { bold: {} } }, { insert: 'X' }, { insert: ' right', attributes: { italic: {} } },
    ]);
    expect(characterIds(text(doc)).slice(0, 5)).toEqual(original.slice(0, 5));
    expect(characterIds(text(doc)).slice(6)).toEqual(original.slice(11));
    expect(() => issueTextSpan(state(doc), spans[0].targetRef, 0, 7)).toThrow(DocTargetError);
  });

  it('does not extend a link across its former boundary when replacing all linked text', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: [
      { type: 'text', text: 'outside ', styles: {} },
      { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'link', styles: {} }] },
      { type: 'text', text: ' outside', styles: {} },
    ] }]);
    const spans = target(doc).spans;
    const result = patch(doc, [replacement(spans[1].targetRef, 'longer linked text')]);
    expect(result.blocks[0].content).toEqual([
      { type: 'text', text: 'outside ', styles: {} },
      { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'longer linked text', styles: {} }] },
      { type: 'text', text: ' outside', styles: {} },
    ]);
    patch(doc, [replacement(spans[1].targetRef, '')]);
    expect(text(doc).toDelta()).toEqual([{ insert: 'outside  outside' }]);
  });

  it('rejects a previously homogeneous target if an intervening human edit adds a mark boundary', () => {
    const doc = seed();
    const ref = fullSpan(doc);
    text(doc).format(1, 2, { bold: {} });
    reject(doc, [replacement(ref, 'must not flatten')], 'TARGET_UNRESOLVABLE');
  });

  it('preserves outside tables, nested blocks, links, hard breaks, code, files and XML metadata', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'target' },
      { id: 'rich', type: 'paragraph', content: [
        { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'link', styles: { underline: true } }] },
        { type: 'text', text: '\nafter break', styles: {} },
      ], children: [{ id: 'nested', type: 'paragraph', content: 'nested' }] },
      { id: 'table', type: 'table', content: { type: 'tableContent', headerRows: 1, columnWidths: [120, 180], rows: [{ cells: ['A', 'B'] }] } },
      { id: 'code', type: 'codeBlock', props: { language: 'typescript' }, content: 'const x = 1;\nnext();' },
      { id: 'file', type: 'file', props: { url: 'https://example.com/a.pdf', name: 'a.pdf' } },
    ]);
    block(doc, 'rich').setAttribute('opaque', 'keep-container');
    (block(doc, 'rich').get(0) as Y.XmlElement).setAttribute('opaqueProp', 'keep-body');
    doc.getMap('opaque-metadata').set('external', { key: 'keep' });
    const outside = nodes(doc).filter((node) => node !== block(doc) && node !== text(doc) && node !== text(doc).parent);
    const identities = outside.map((node) => encodeContainerIdentity(node as Y.XmlElement | Y.XmlText));
    const beforeBlocks = applyTargetPatch(state(doc), [bodyReplacement(target(doc).blockRef, 'target')]).blocks.slice(1);
    const result = patch(doc, [replacement(fullSpan(doc), 'agent')]);
    expect(result.blocks.slice(1)).toEqual(beforeBlocks);
    expect(outside.map((node) => encodeContainerIdentity(node as Y.XmlElement | Y.XmlText))).toEqual(identities);
    expect(outside.every((node) => nodes(doc).includes(node))).toBe(true);
    expect(block(doc, 'rich').getAttribute('opaque')).toBe('keep-container');
    expect((block(doc, 'rich').get(0) as Y.XmlElement).getAttribute('opaqueProp')).toBe('keep-body');
    expect(doc.getMap('opaque-metadata').get('external')).toEqual({ key: 'keep' });
  });

  it('edits a single table cell span without widening to a table body operation', () => {
    const doc = seed([{ id: 'table', type: 'table', content: { type: 'tableContent', rows: [{ cells: ['A', 'B'] }] } }]);
    const inspected = target(doc, 'table');
    patch(doc, [replacement(inspected.spans[0].targetRef, 'cell')]);
    expect(target(doc, 'table').spans.map((span) => span.text)).toEqual(['cell', 'B']);
    reject(doc, [bodyReplacement(inspected.blockRef, 'no restructuring')], 'TARGET_UNRESOLVABLE');
  });

  it('supports one side of a hard break but rejects replacing the complex body', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'left\nright' }]);
    const inspected = target(doc);
    expect(inspected.spans.map((span) => span.text)).toEqual(['left', 'right']);
    patch(doc, [replacement(inspected.spans[0].targetRef, 'changed')]);
    expect(target(doc).spans[1].text).toBe('right');
    reject(doc, [bodyReplacement(inspected.blockRef, 'flat')], 'TARGET_UNRESOLVABLE');
  });

  it('supports code newlines but rejects implicit paragraph hard-break insertion', () => {
    const doc = seed([{ id: 'p', type: 'codeBlock', content: 'first\nsecond' }]);
    patch(doc, [bodyReplacement(target(doc).blockRef, 'new\ncode')]);
    patch(doc, [replacement(fullSpan(doc), 'another\nline')]);
    expect(plain(text(doc))).toBe('another\nline');
    const paragraph = seed();
    reject(paragraph, [replacement(fullSpan(paragraph), 'a\nb')], 'TARGET_UNRESOLVABLE');
    reject(paragraph, [bodyReplacement(target(paragraph).blockRef, 'a\nb')], 'TARGET_UNRESOLVABLE');
  });

  it('uses UTF-16 offsets for surrogate pairs and preserves combining characters outside scope', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'A\u{1F680}e\u0301Z' }]);
    const original = characterIds(text(doc));
    const ref = precise(doc, 1, 3);
    patch(doc, [replacement(ref, '\u{1F600}')]);
    expect(plain(text(doc))).toBe('A\u{1F600}e\u0301Z');
    expect(characterIds(text(doc)).slice(3)).toEqual(original.slice(3));
    expect(() => precise(doc, 1, 2)).toThrow('surrogate pair');
    reject(doc, [replacement(fullSpan(doc), '\uD800')], 'TARGET_UNRESOLVABLE');
  });
});

describe('batch validation, normalization and bounds', () => {
  it('rejects overlapping, duplicate, body/span and ancestor/descendant targets atomically', () => {
    const doc = seed([{ id: 'p', type: 'paragraph', content: 'abcdef', children: [{ id: 'child', type: 'paragraph', content: 'child' }] }]);
    const a = precise(doc, 0, 3), b = precise(doc, 2, 4);
    reject(doc, [replacement(a, 'one'), replacement(b, 'two')], 'CONFLICT');
    reject(doc, [replacement(a, 'one'), replacement(a, 'two')], 'CONFLICT');
    reject(doc, [bodyReplacement(target(doc).blockRef, 'body'), replacement(a, 'text')], 'CONFLICT');
    reject(doc, [bodyReplacement(target(doc).blockRef, 'body'), bodyReplacement(target(doc).blockRef, 'again')], 'CONFLICT');
    reject(doc, [replacement(a, 'parent'), replacement(fullSpan(doc, 'child'), 'child')], 'CONFLICT');
    reject(doc, [bodyReplacement(target(doc).blockRef, 'parent'), replacement(fullSpan(doc, 'child'), 'child')], 'CONFLICT');
  });

  it('accepts adjacent ranges and disjoint block edits resolved before mutations', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'abcdef' },
      { id: 'other', type: 'paragraph', content: 'other' },
    ]);
    patch(doc, [replacement(precise(doc, 0, 3), 'L'), replacement(precise(doc, 3, 6), 'RIGHT'), bodyReplacement(target(doc, 'other').blockRef, 'new')]);
    expect(plain(text(doc))).toBe('LRIGHT');
    expect(plain(text(doc, 'other'))).toBe('new');
  });

  it('resolves every operation before editing and returns nothing when a later target is gone', () => {
    const doc = seed([
      { id: 'p', type: 'paragraph', content: 'keep' },
      { id: 'other', type: 'paragraph', content: 'gone' },
    ]);
    const missing = fullSpan(doc, 'other');
    (block(doc).parent as Y.XmlElement).delete(1, 1);
    reject(doc, [replacement(fullSpan(doc), 'must not apply'), replacement(missing, 'gone')], 'TARGET_GONE');
    expect(plain(text(doc))).toBe('keep');
  });

  it('rejects normalization rather than publishing a repaired document', () => {
    const doc = seed();
    const ref = fullSpan(doc);
    (block(doc).parent as Y.XmlElement).insert(1, [new Y.XmlElement('unknownNode')]);
    const input = state(doc);
    const disposable = load(input);
    const before = bytes(state(disposable));
    initProseMirrorDoc(disposable.getXmlFragment('prosemirror'), editor.pmSchema);
    expect(bytes(state(disposable))).not.toBe(before);
    reject(doc, [replacement(ref, 'no repair')], 'NORMALIZATION');
    expect(() => inspectTargets(input)).toThrow('Projection changed the binary history');
  });

  it('rejects invalid marks, missing IDs, duplicate IDs and invalid final structure', () => {
    const marks = seed();
    const ref = fullSpan(marks);
    text(marks).format(0, 2, { unknownMark: {} });
    reject(marks, [replacement(ref, 'no repair')], 'NORMALIZATION');
    const missing = seed();
    const missingRef = fullSpan(missing);
    block(missing).removeAttribute('id');
    reject(missing, [replacement(missingRef, 'no ID generation')], 'INVALID_DOCUMENT');
    const duplicates = seed([
      { id: 'p', type: 'paragraph', content: 'one' }, { id: 'other', type: 'paragraph', content: 'two' },
    ]);
    const duplicateRef = fullSpan(duplicates);
    block(duplicates, 'other').setAttribute('id', 'p');
    reject(duplicates, [replacement(duplicateRef, 'no duplicates')], 'INVALID_DOCUMENT');
    const invalid = seed();
    const invalidRef = fullSpan(invalid);
    (block(invalid).get(0) as Y.XmlElement).insert(1, [new Y.XmlElement('blockGroup')]);
    reject(invalid, [replacement(invalidRef, 'no invalid nesting')], 'NORMALIZATION');
  });

  it('rejects strict operation/style validation and excessive operation count', () => {
    const doc = seed();
    reject(doc, [], 'INVALID_PATCH');
    reject(doc, Array.from({ length: 101 }, () => replacement(fullSpan(doc), 'x')), 'INVALID_PATCH');
    reject(doc, [{ ...replacement(fullSpan(doc), 'x'), extra: true }], 'INVALID_PATCH');
    reject(doc, [{ type: 'replace_body', targetRef: target(doc).blockRef, content: [{ type: 'text', text: 'x', styles: { unknown: true } }] }], 'INVALID_PATCH');
    reject(doc, [{ type: 'replace_body', targetRef: target(doc).blockRef, content: [{ type: 'text', text: 'x', styles: { bold: 'yes' } }] }], 'INVALID_PATCH');
    reject(doc, [{ type: 'replace_body', targetRef: target(doc).blockRef, content: [{ type: 'text', text: 'x', styles: {}, extra: 'not silently dropped' }] }], 'INVALID_PATCH');
    const circular: unknown[] = [];
    circular.push(circular);
    reject(doc, circular, 'INVALID_PATCH');
  });

  it('rejects oversized input, request and final projection while leaving the original state intact', () => {
    const doc = seed();
    expect(() => inspectTargets(new Uint8Array(MAX_DOC_SYNC_PAYLOAD_BYTES + 1))).toThrow('sync limit');
    reject(doc, [replacement(fullSpan(doc), 'x'.repeat(MAX_DOC_CONTENT_BYTES))], 'LIMIT_EXCEEDED');
    const large = seed([
      { id: 'p', type: 'paragraph', content: 'small' },
      { id: 'other', type: 'paragraph', content: 'x'.repeat(300_000) },
    ]);
    reject(large, [replacement(fullSpan(large), 'y'.repeat(230_000))], 'INVALID_DOCUMENT');
    const largeBinary = seed();
    largeBinary.getMap('opaque').set('payload', 'x'.repeat(MAX_DOC_SYNC_PAYLOAD_BYTES - 4_000));
    expect(state(largeBinary).byteLength).toBeLessThan(MAX_DOC_SYNC_PAYLOAD_BYTES);
    reject(largeBinary, [replacement(fullSpan(largeBinary), 'y'.repeat(5_000))], 'LIMIT_EXCEEDED');
  });

  it('rejects malformed and unresolved history rather than materializing a prefix', () => {
    expect(() => inspectTargets(new Uint8Array([1, 2, 3]))).toThrow('Malformed Yjs');
    const doc = seed();
    const vector = Y.encodeStateVector(doc);
    text(doc).insert(0, 'dependent');
    expect(() => inspectTargets(Y.encodeStateAsUpdate(doc, vector))).toThrow('unresolved dependencies');
  });

  it('returns a deletion-only delta despite equal state vectors and replays it idempotently', () => {
    const doc = seed();
    const replica = load(state(doc));
    const before = bytes(Y.encodeStateVector(doc));
    const result = patch(doc, [replacement(precise(doc, 7, 13), '')]);
    expect(bytes(Y.encodeStateVector(doc))).toBe(before);
    Y.applyUpdate(replica, result.update);
    Y.applyUpdate(replica, result.update);
    expect(plain(text(replica))).toBe('before  after');
    expect(bytes(state(replica))).toBe(bytes(state(doc)));
  });
});
