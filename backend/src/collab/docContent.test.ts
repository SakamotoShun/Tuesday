import { describe, expect, it } from 'bun:test';
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
