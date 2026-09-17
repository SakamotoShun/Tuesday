import { afterEach, describe, expect, it } from 'bun:test';
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYDoc } from '@blocknote/core/yjs';
import { Transform } from 'prosemirror-transform';
import { initProseMirrorDoc, updateYFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { docTargetSchema } from './docTargetSchema';
import { encodeContainerIdentity, inspectTargets, issueTextSpan } from './docTargetExperiment';

const editor = BlockNoteEditor.create({ schema: docTargetSchema });
const documents: Y.Doc[] = [];
afterEach(() => {
  for (const doc of documents.splice(0)) doc.destroy();
});

function seed(blocks: PartialBlock[]): Y.Doc {
  const doc = blocksToYDoc(editor, blocks);
  documents.push(doc);
  return doc;
}

function load(state: Uint8Array, gc: boolean): Y.Doc {
  const doc = new Y.Doc({ gc });
  documents.push(doc);
  Y.applyUpdate(doc, state);
  return doc;
}

const state = (doc: Y.Doc) => Y.encodeStateAsUpdate(doc);
const bytes = (value: Uint8Array) => Buffer.from(value).toString('base64');
const root = (doc: Y.Doc) => doc.getXmlFragment('prosemirror');
const text = (doc: Y.Doc) => Array.from(root(doc).createTreeWalker(
  (node) => node instanceof Y.XmlText,
))[0] as Y.XmlText;
const plain = (value: Y.XmlText) => value.toDelta().map((part: { insert: string }) => part.insert).join('');

function pmEdit(doc: Y.Doc, edit: (tr: Transform) => void) {
  const initialized = initProseMirrorDoc(root(doc), editor.pmSchema);
  const tr = new Transform(initialized.doc);
  edit(tr);
  tr.doc.check();
  updateYFragment(doc, root(doc), tr.doc, initialized.meta);
  return tr.steps.map((step) => step.toJSON());
}

function paragraph(tr: Transform, id: string, value: string) {
  const first = tr.doc.firstChild!.firstChild!;
  return first.type.create(
    { ...first.attrs, id },
    first.firstChild!.type.create(first.firstChild!.attrs, editor.pmSchema.text(value)),
  );
}

const cases = [
  'whole span split vs replacement and new paragraph',
  'interior split vs replacement, suffix deletion and new paragraph',
  'existing neighbour merge vs boundary insertion and neighbour deletion',
  'post-issuance neighbour merge vs boundary insertion and neighbour deletion',
] as const;

describe.each([true, false])('current-state discriminator loses structural provenance (gc=%s)', (gc) => {
  it.each([...cases])('%s', (scenario) => {
    const interior = scenario === cases[1];
    const splitting = scenario === cases[0] || interior;
    const postIssuance = scenario === cases[3];
    const initialText = interior ? 'before TARGET after' : splitting ? 'TARGET' : 'first';

    for (const separate of [false, true]) {
      const source = seed([
        { id: 'p', type: 'paragraph', content: initialText },
        ...(scenario === cases[2] ? [{ id: 'other', type: 'paragraph' as const, content: 'second' }] : []),
      ]);
      const baseline = state(source);
      let structural = load(baseline, gc);
      let permitted = load(baseline, gc);
      // Alternative timelines for the same writer; never apply one branch to the other.
      const writerClientId = source.clientID === 424242 ? 424243 : 424242;
      structural.clientID = writerClientId;
      permitted.clientID = writerClientId;
      const originalStructuralText = text(structural);
      const originalPermittedText = text(permitted);

      // Issue references only at the common baseline. No candidate classification is asserted.
      const refs = [structural, permitted].map((doc) => {
        const whole = inspectTargets(state(doc))[0].spans[0].targetRef;
        return interior ? issueTextSpan(state(doc), whole, 7, 13) : whole;
      });
      expect(refs[0]).toEqual(refs[1]);
      expect(bytes(state(structural))).toBe(bytes(baseline));
      expect(bytes(state(permitted))).toBe(bytes(baseline));

      const structuralUpdates: Uint8Array[] = [];
      const permittedUpdates: Uint8Array[] = [];
      structural.on('update', (update: Uint8Array) => structuralUpdates.push(update));
      permitted.on('update', (update: Uint8Array) => permittedUpdates.push(update));

      if (postIssuance) {
        expect(refs[0].after).toBe('none');
        const createNeighbour = (tr: Transform) => {
          tr.insert(1 + tr.doc.firstChild!.firstChild!.nodeSize, paragraph(tr, 'other', 'second'));
        };
        expect(pmEdit(structural, createNeighbour)).toEqual(pmEdit(permitted, createNeighbour));
        expect(bytes(state(structural))).toBe(bytes(state(permitted)));
      }

      const structuralSteps = pmEdit(structural, (tr) => {
        if (splitting) {
          tr.split(interior ? 13 : 6, 2);
          const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
          // Stand in for the browser UniqueID plugin before reconciling the new block.
          tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, id: 'created' });
        } else {
          tr.join(1 + tr.doc.firstChild!.firstChild!.nodeSize, 2);
        }
      });

      const permittedEdits: Array<(tr: Transform) => void> = [];
      if (splitting) {
        permittedEdits.push((tr) => {
          tr.replaceWith(interior ? 10 : 3, interior ? 16 : 9, editor.pmSchema.text('TAR'));
        });
        if (interior) permittedEdits.push((tr) => { tr.delete(13, 19); });
        permittedEdits.push((tr) => {
          tr.insert(
            1 + tr.doc.firstChild!.firstChild!.nodeSize,
            paragraph(tr, 'created', interior ? 'GET after' : 'GET'),
          );
        });
      } else {
        permittedEdits.push((tr) => { tr.insert(8, editor.pmSchema.text('second')); });
        permittedEdits.push((tr) => {
          const pos = 1 + tr.doc.firstChild!.firstChild!.nodeSize;
          tr.delete(pos, pos + tr.doc.firstChild!.child(1).nodeSize);
        });
      }
      const permittedSteps = separate
        ? permittedEdits.flatMap((edit) => pmEdit(permitted, edit))
        : pmEdit(permitted, (tr) => { for (const edit of permittedEdits) edit(tr); });

      expect(structuralSteps.length).toBeGreaterThan(0);
      expect(permittedSteps.length).toBeGreaterThan(0);
      expect(structuralSteps).not.toEqual(permittedSteps);
      expect(text(structural)).toBe(originalStructuralText);
      expect(text(permitted)).toBe(originalPermittedText);
      expect(structuralUpdates).toHaveLength(postIssuance ? 2 : 1);
      expect(permittedUpdates).toHaveLength((postIssuance ? 1 : 0) + (separate ? permittedEdits.length : 1));
      if (!separate) {
        // Equality includes CRDT IDs and deletion information, not just rendered XML.
        expect(structuralUpdates.map(bytes)).toEqual(permittedUpdates.map(bytes));
      }
      expect(bytes(state(structural))).toBe(bytes(state(permitted)));
      expect(bytes(Y.encodeStateAsUpdate(structural, Y.encodeStateVector(source))))
        .toBe(bytes(Y.encodeStateAsUpdate(permitted, Y.encodeStateVector(source))));

      const expectedTexts = splitting ? [interior ? 'before TAR' : 'TAR', interior ? 'GET after' : 'GET'] : ['firstsecond'];
      const assertTargetIdentity = (doc: Y.Doc) => {
        expect(encodeContainerIdentity(text(doc))).toBe(refs[0].container);
        const relative = Y.decodeRelativePosition(Buffer.from(refs[0].container, 'base64'));
        expect(Y.createAbsolutePositionFromRelativePosition(relative, doc, false)?.type).toBe(text(doc));
        const blocks = Array.from(root(doc).createTreeWalker(
          (node) => node instanceof Y.XmlElement && node.nodeName === 'blockContainer',
        )) as Y.XmlElement[];
        expect(blocks.map((block) => block.getAttribute('id'))).toEqual(splitting ? ['p', 'created'] : ['p']);
        expect(encodeContainerIdentity(blocks[0])).toBe(refs[0].block.container);
        expect(Array.from(root(doc).createTreeWalker((node) => node instanceof Y.XmlText))
          .map((node) => plain(node as Y.XmlText))).toEqual(expectedTexts);
      };
      assertTargetIdentity(structural);
      assertTargetIdentity(permitted);

      // Each checkpoint reloads its own history, including a final default-GC materialization.
      for (const reloadGc of [gc, gc, true]) {
        structural = load(state(structural), reloadGc);
        permitted = load(state(permitted), reloadGc);
        expect(structural.gc).toBe(reloadGc);
        expect(permitted.gc).toBe(reloadGc);
        expect(bytes(state(structural))).toBe(bytes(state(permitted)));
        assertTargetIdentity(structural);
        assertTargetIdentity(permitted);
      }
    }
  });
});
