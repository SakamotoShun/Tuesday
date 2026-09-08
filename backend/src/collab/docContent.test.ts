import { describe, expect, it } from 'bun:test';
import { validateRawDocBlocks } from '../utils/doc-blocks';
import {
  alignLegacyBlockIds,
  assertDocBlocksCanonicalizable,
  blocksFromYDoc,
  canonicalizeDocBlocksForPersistence,
  canonicalizeDocBlocks,
  DocBlockCanonicalizationError,
  mergeOpaqueBlockMetadata,
  yDocFromBlocks,
} from './docContent';

describe('document Yjs content conversion', () => {
  it('derives canonical blocks from the authoritative Yjs document', () => {
    const blocks = [{
      id: 'paragraph-1',
      type: 'paragraph',
      props: {},
      content: [{ type: 'text', text: 'Canonical text', styles: {} }],
      children: [],
    }];

    expect(blocksFromYDoc(yDocFromBlocks(blocks))).toEqual(canonicalizeDocBlocks(blocks));
    expect(canonicalizeDocBlocks(blocks)[0]?.content).toEqual(blocks[0]?.content);
  });

  it('preserves the configured code block shape', () => {
    const blocks = [{
      id: 'code-1',
      type: 'codeBlock',
      props: { language: 'typescript' },
      content: [{ type: 'text', text: 'const safe = true', styles: {} }],
      children: [],
    }];

    expect(canonicalizeDocBlocks(blocks)[0]).toMatchObject({
      id: 'code-1',
      type: 'codeBlock',
      props: { language: 'typescript' },
      content: blocks[0]?.content,
    });
  });

  it.each([
    {},
    { columnWidths: [null, 180] },
    { columnWidths: [120, 180], headerRows: 1 },
    { headerCols: 1 },
    { headerRows: 1, headerCols: 1 },
  ])('round-trips tables with optional settings %j as JSON-safe blocks', (settings) => {
    const styledText = [{ type: 'text', text: 'Name', styles: { bold: true } }];
    const blocks = [{
      id: 'table-1',
      type: 'table',
      props: {},
      children: [],
      customTop: 'keep',
      content: {
        type: 'tableContent',
        ...settings,
        rows: [
          { cells: [{ type: 'tableCell', props: { textAlignment: 'center' }, content: styledText }, 'Status'] },
          { cells: ['Alice', 'Active'] },
        ],
      },
    }];

    const canonical = canonicalizeDocBlocks(blocks);
    expect(canonical[0]).toMatchObject({
      id: 'table-1',
      type: 'table',
      children: [],
      content: {
        type: 'tableContent',
        columnWidths: settings.columnWidths ?? [null, null],
        ...settings,
        rows: [
          { cells: [
            { props: { textAlignment: 'center' }, content: styledText },
            { content: [{ type: 'text', text: 'Status', styles: {} }] },
          ] },
          { cells: [
            { content: [{ type: 'text', text: 'Alice', styles: {} }] },
            { content: [{ type: 'text', text: 'Active', styles: {} }] },
          ] },
        ],
      },
    });
    expect(canonical).toEqual(JSON.parse(JSON.stringify(canonical)));
    expect(() => validateRawDocBlocks(canonical)).not.toThrow();
    expect(canonicalizeDocBlocks(canonical)).toEqual(canonical);
    expect(blocksFromYDoc(yDocFromBlocks(blocks))).toEqual(canonical);
    expect(blocksFromYDoc(yDocFromBlocks(canonical))).toEqual(canonical);
    expect(canonicalizeDocBlocksForPersistence(blocks)).toEqual([
      { ...canonical[0], customTop: 'keep' },
    ]);
  });

  it('normalizes generated table fields inside nested blocks', () => {
    const blocks = [{
      id: 'parent', type: 'paragraph', props: {}, content: [],
      children: [{
        id: 'nested-table', type: 'table', props: {}, children: [],
        content: { type: 'tableContent', rows: [{ cells: ['Nested'] }] },
      }],
    }];
    const canonical = canonicalizeDocBlocks(blocks);

    expect(canonical[0].children[0]).toMatchObject({
      id: 'nested-table',
      content: { columnWidths: [null], rows: [{ cells: [{ content: [{ text: 'Nested' }] }] }] },
    });
    expect(blocksFromYDoc(yDocFromBlocks(canonical))).toEqual(canonical);
  });

  it('still rejects non-JSON input before BlockNote conversion', () => {
    const blocks = [{
      id: 'table-1', type: 'table', props: {}, children: [],
      content: { type: 'tableContent', headerRows: undefined, rows: [{ cells: ['A'] }] },
    }];

    expect(() => canonicalizeDocBlocks(blocks)).toThrow('only JSON values');
    expect(() => canonicalizeDocBlocksForPersistence(blocks)).toThrow('only JSON values');
    expect(() => yDocFromBlocks(blocks)).toThrow('only JSON values');
  });

  it('aligns missing legacy IDs and preserves opaque block metadata', () => {
    const derived = canonicalizeDocBlocks([{
      id: 'derived-id',
      type: 'paragraph',
      props: {},
      content: [],
      children: [],
    }]);
    const legacy = [{
      type: 'paragraph',
      props: { customProp: 'keep' },
      content: [],
      children: [],
      customTop: 'keep',
    }];
    const aligned = alignLegacyBlockIds(legacy, derived);
    const merged = mergeOpaqueBlockMetadata(derived, aligned);

    expect(canonicalizeDocBlocks(aligned)).toEqual(derived);
    expect(merged[0]).toMatchObject({
      id: 'derived-id',
      customTop: 'keep',
      props: { customProp: 'keep' },
    });
  });

  it('persists canonical fields while retaining opaque block metadata', () => {
    const content = [{
      id: 'paragraph-1',
      type: 'paragraph',
      props: { customProp: 'keep', textAlignment: 'center' },
      content: [{ type: 'text', text: 'Canonical text', styles: {} }],
      children: [],
      customTop: 'keep',
    }];

    expect(canonicalizeDocBlocksForPersistence(content)[0]).toMatchObject({
      id: 'paragraph-1',
      type: 'paragraph',
      customTop: 'keep',
      props: {
        customProp: 'keep',
        textAlignment: 'center',
      },
      content: content[0]?.content,
    });
  });

  it('wraps only BlockNote conversion failures and preserves their cause', () => {
    let error: unknown;
    try {
      canonicalizeDocBlocksForPersistence([{
        id: 'paragraph-1',
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: 42, styles: {} }],
        children: [],
      }]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DocBlockCanonicalizationError);
    expect((error as Error).message).toBe('Blocks contain invalid BlockNote content');
    expect((error as DocBlockCanonicalizationError).cause).toBeInstanceOf(TypeError);
    expect(() => canonicalizeDocBlocksForPersistence('not blocks')).not.toThrow(DocBlockCanonicalizationError);
  });

  it('rejects sparse input that expands beyond the canonical document limit', () => {
    const sparse = Array.from({ length: 4_000 }, (_, index) => ({
      id: `paragraph-${index}`,
      type: 'paragraph',
      props: {},
      children: [],
    }));

    expect(() => assertDocBlocksCanonicalizable(sparse)).toThrow('maximum size');
  });
});
