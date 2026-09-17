import { describe, expect, it } from 'bun:test';
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYDoc } from '@blocknote/core/yjs';
import * as Y from 'yjs';
import { docSchema } from './docSchema';
import { selectLiteralSpans } from './docLiteralSearch';

const editor = BlockNoteEditor.create({ schema: docSchema });
function state(blocks: PartialBlock<typeof docSchema.blockSchema, typeof docSchema.inlineContentSchema, typeof docSchema.styleSchema>[]) {
  const doc = blocksToYDoc(editor, blocks);
  try { return Y.encodeStateAsUpdate(doc); } finally { doc.destroy(); }
}
describe('current literal span selection', () => {
  it('matches across formatting/link runs with UTF-16 offsets and literal casing', () => {
    const doc = state([{ id: 'p', type: 'paragraph', content: [
      { type: 'text', text: '😀 TA', styles: { bold: true } },
      { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'RGET a.b aXb', styles: {} }] },
    ] }]);
    expect(selectLiteralSpans(doc, 'TARGET', 10, 0).selections).toMatchObject([{ blockId: 'p', inlineIndex: 0, from: 3, to: 9, referenceEligible: false }]);
    expect(selectLiteralSpans(doc, 'target', 10, 0).selections).toEqual([]);
    expect(selectLiteralSpans(doc, 'a.b', 10, 0).selections).toHaveLength(1);
  });
  it('bounds and pages overlapping occurrences without broadening them', () => {
    const doc = state([{ id: 'p', type: 'paragraph', content: 'banana' }]);
    expect(selectLiteralSpans(doc, 'ana', 1, 0)).toMatchObject({ hasMore: true, selections: [{ from: 1, to: 4 }] });
    expect(selectLiteralSpans(doc, 'ana', 1, 1)).toMatchObject({ hasMore: false, selections: [{ from: 3, to: 6 }] });
    expect(selectLiteralSpans(doc, 'ana', 1, 2).selections).toEqual([]);
  });
  it('never joins blocks or table-cell inline containers', () => {
    const doc = state([{ id: 'a', type: 'paragraph', content: 'left' }, { id: 'b', type: 'paragraph', content: 'right' },
      { id: 't', type: 'table', content: { type: 'tableContent', rows: [{ cells: ['left', 'right'] }] } }]);
    expect(selectLiteralSpans(doc, 'leftright', 20, 0).selections).toEqual([]);
    expect(selectLiteralSpans(doc, 'right', 20, 0).selections).toMatchObject([
      { blockId: 'b', inlineIndex: 0, from: 0, to: 5 }, { blockId: 't', inlineIndex: 1, from: 0, to: 5 },
    ]);
    expect(selectLiteralSpans(doc, undefined, 20, 0).selections).toHaveLength(4);
  });
});
