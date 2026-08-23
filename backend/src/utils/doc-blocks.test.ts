import { describe, expect, it } from 'bun:test';
import {
  applyDocBlockEdits,
  MAX_DOC_BLOCK_DEPTH,
  MAX_DOC_BLOCKS,
  MAX_DOC_CONTENT_BYTES,
  normalizeLegacyDocBlocks,
  validateDocBlockEditOperations,
  validateRawDocBlocks,
  type RawDocBlock,
} from './doc-blocks';

function block(id: string, children: RawDocBlock[] = [], content: unknown = []): RawDocBlock {
  return { id, type: 'paragraph', props: {}, content, children };
}

function nestedBlocks(depth: number): RawDocBlock[] {
  let current = block(`depth-${depth}`);
  for (let level = depth - 1; level >= 1; level -= 1) {
    current = block(`depth-${level}`, [current]);
  }
  return [current];
}

describe('validateRawDocBlocks', () => {
  it('accepts recursively valid envelopes and arbitrary content', () => {
    expect(() => validateRawDocBlocks([block('root', [block('child', [], { any: 'value' })], null)])).not.toThrow();
  });

  it.each([
    [null, 'Blocks must be an array'],
    [[null], 'Block at Blocks[0] must be a plain object'],
    [[{ id: '', type: 'paragraph', props: {}, children: [] }], 'Block at Blocks[0] must have a non-empty string id'],
    [[{ id: 'a', type: '', props: {}, children: [] }], 'Block "a" must have a non-empty string type'],
    [[{ id: 'a', type: 'paragraph', props: [], children: [] }], 'Block "a" must have plain-object props'],
    [[{ id: 'a', type: 'paragraph', props: {}, children: null }], 'Block "a" must have an array of children'],
    [[block('a', [null as unknown as RawDocBlock])], 'Block at Blocks[0].children[0] must be a plain object'],
  ])('rejects a malformed recursive envelope', (value, message) => {
    expect(() => validateRawDocBlocks(value)).toThrow(message as string);
  });

  it('rejects duplicate IDs anywhere in the existing tree', () => {
    expect(() => validateRawDocBlocks([block('a', [block('same')]), block('same')]))
      .toThrow('Duplicate block ID "same"');
  });

  it('enforces block depth, JSON depth, and byte limits', () => {
    expect(() => validateRawDocBlocks(nestedBlocks(MAX_DOC_BLOCK_DEPTH))).not.toThrow();
    expect(() => validateRawDocBlocks(nestedBlocks(MAX_DOC_BLOCK_DEPTH + 1)))
      .toThrow(`maximum block depth of ${MAX_DOC_BLOCK_DEPTH}`);

    let deeplyNestedContent: unknown = 'value';
    for (let depth = 0; depth < 130; depth += 1) deeplyNestedContent = [deeplyNestedContent];
    expect(() => validateRawDocBlocks([block('deep-json', [], deeplyNestedContent)]))
      .toThrow('maximum JSON depth');

    expect(() => validateRawDocBlocks([block('large', [], 'x'.repeat(MAX_DOC_CONTENT_BYTES))]))
      .toThrow(`maximum size of ${MAX_DOC_CONTENT_BYTES} bytes`);
  });
});

describe('normalizeLegacyDocBlocks', () => {
  it('completes historical partial blocks while preserving custom fields', () => {
    const normalized = normalizeLegacyDocBlocks([{
      type: 'heading',
      content: [{ type: 'text', text: 'Legacy', styles: {} }],
      custom: true,
      children: [{ id: 'child', type: 'paragraph', content: [] }],
    }]);

    expect(normalized[0]).toMatchObject({ type: 'heading', props: {}, custom: true });
    expect(normalized[0].id).toBeString();
    expect(normalized[0].id.length).toBeGreaterThan(0);
    expect(normalized[0].children[0]).toMatchObject({ id: 'child', type: 'paragraph', props: {}, children: [] });
  });

  it('defaults empty historical IDs and types but rejects malformed supplied fields', () => {
    const [normalized] = normalizeLegacyDocBlocks([{ id: '', type: '', content: [] }]);
    expect(normalized.id.length).toBeGreaterThan(0);
    expect(normalized.type).toBe('paragraph');

    expect(() => normalizeLegacyDocBlocks([{ id: 1 }])).toThrow('must have a string id when provided');
    expect(() => normalizeLegacyDocBlocks([{ type: 1 }])).toThrow('must have a string type when provided');
    expect(() => normalizeLegacyDocBlocks([{ props: [] }])).toThrow('must have plain-object props when provided');
    expect(() => normalizeLegacyDocBlocks([{ children: null }])).toThrow('must have an array of children when provided');
  });

  it('rejects duplicate supplied IDs', () => {
    expect(() => normalizeLegacyDocBlocks([{ id: 'same' }, { id: 'same' }]))
      .toThrow('Duplicate block ID "same"');
  });
});

describe('applyDocBlockEdits', () => {
  it('deletes a root block and reports its ID', () => {
    const original = [block('a'), block('b')];
    const result = applyDocBlockEdits(original, [{ type: 'delete', path: ['a'] }]);

    expect(result.blocks).toEqual([block('b')]);
    expect(result.deletedBlockIds).toEqual(['a']);
    expect(original).toEqual([block('a'), block('b')]);
  });

  it('deletes a nested block without mutating the original', () => {
    const original = [block('root', [block('a'), block('b')])];
    const result = applyDocBlockEdits(original, [{ type: 'delete', path: ['root', 'a'] }]);

    expect(result.blocks[0].children.map((item) => item.id)).toEqual(['b']);
    expect(original[0].children.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('supports a one-to-one same-ID modification', () => {
    const original = [block('a', [], 'old')];
    const replacement = block('a', [], 'new');
    const result = applyDocBlockEdits(original, [{ type: 'replace', path: ['a'], blocks: [replacement] }]);

    expect(result.blocks).toEqual([replacement]);
    expect(result.replacementRootIds).toEqual(['a']);
  });

  it('supports one-to-many replacement and preserves replacement order', () => {
    const result = applyDocBlockEdits(
      [block('before'), block('target'), block('after')],
      [{ type: 'replace', path: ['target'], blocks: [block('x'), block('y')] }],
    );

    expect(result.blocks.map((item) => item.id)).toEqual(['before', 'x', 'y', 'after']);
  });

  it('applies multiple edits against original paths while preserving sibling order', () => {
    const result = applyDocBlockEdits(
      [block('root', [block('a'), block('b'), block('c')])],
      [
        { type: 'replace', path: ['root', 'b'], blocks: [block('x'), block('y')] },
        { type: 'delete', path: ['root', 'a'] },
      ],
    );

    expect(result.blocks[0].children.map((item) => item.id)).toEqual(['x', 'y', 'c']);
  });

  it('rejects missing roots and paths that skip a direct parent', () => {
    const original = [block('root', [block('parent', [block('child')])])];

    expect(() => applyDocBlockEdits(original, [{ type: 'delete', path: ['missing'] }]))
      .toThrow('Block path not found: "missing"');
    expect(() => applyDocBlockEdits(original, [{ type: 'delete', path: ['root', 'child'] }]))
      .toThrow('Block path not found: "root/child"');
  });

  it('rejects duplicate and ancestor/descendant targets', () => {
    const original = [block('root', [block('child')])];

    expect(() => applyDocBlockEdits(original, [
      { type: 'delete', path: ['root'] },
      { type: 'delete', path: ['root'] },
    ])).toThrow('Duplicate edit target: "root"');
    expect(() => applyDocBlockEdits(original, [
      { type: 'delete', path: ['root'] },
      { type: 'delete', path: ['root', 'child'] },
    ])).toThrow('Overlapping edit targets: "root" and "root/child"');
  });

  it('validates operation and replacement envelopes', () => {
    expect(() => applyDocBlockEdits([block('a')], []))
      .toThrow('Operations must be an array with 1 to 100 items');
    expect(() => applyDocBlockEdits([block('a')], [{ type: 'delete', path: [] }]))
      .toThrow('Operation 1 path must contain 1 to 32 non-empty string IDs');
    expect(() => applyDocBlockEdits([block('a')], [{ type: 'replace', path: ['a'], blocks: [] }]))
      .toThrow('Operation 1 blocks must contain 1 to 100 complete blocks');
    expect(() => applyDocBlockEdits([block('a')], [{ type: 'delete', path: ['a'], extra: true }]))
      .toThrow('Operation 1 contains unexpected property "extra"');
    expect(() => applyDocBlockEdits([block('a')], [{
      type: 'replace',
      path: ['a'],
      blocks: [{ id: 'x', type: 'paragraph', props: {}, children: [null] }],
    }])).toThrow('Block at Operation 1 blocks[0].children[0] must be a plain object');
  });

  it('enforces operation and replacement count limits', () => {
    const operations = Array.from({ length: 101 }, () => ({ type: 'delete', path: ['a'] }));
    const replacements = Array.from({ length: 101 }, (_, index) => block(`replacement-${index}`));

    expect(() => applyDocBlockEdits([block('a')], operations))
      .toThrow('Operations must be an array with 1 to 100 items');
    expect(() => applyDocBlockEdits([block('a')], [{ type: 'replace', path: ['a'], blocks: replacements }]))
      .toThrow('Operation 1 blocks must contain 1 to 100 complete blocks');
  });

  it('enforces the path depth limit before resolving a target', () => {
    const validPath = Array.from({ length: MAX_DOC_BLOCK_DEPTH }, (_, index) => `depth-${index + 1}`);
    expect(() => applyDocBlockEdits(nestedBlocks(MAX_DOC_BLOCK_DEPTH), [{ type: 'delete', path: validPath }]))
      .not.toThrow();
    expect(() => validateDocBlockEditOperations([{
      type: 'delete',
      path: [...validPath, 'too-deep'],
    }])).toThrow(`1 to ${MAX_DOC_BLOCK_DEPTH} non-empty string IDs`);
  });

  it('rejects duplicate IDs within one replacement', () => {
    expect(() => applyDocBlockEdits([block('a')], [{
      type: 'replace',
      path: ['a'],
      blocks: [block('x'), block('x')],
    }])).toThrow('Duplicate block ID "x"');
  });

  it('rejects collisions between separate replacements', () => {
    expect(() => applyDocBlockEdits([block('a'), block('b')], [
      { type: 'replace', path: ['a'], blocks: [block('x')] },
      { type: 'replace', path: ['b'], blocks: [block('x')] },
    ])).toThrow('Duplicate block ID "x"');
  });

  it('rejects a replacement ID collision with an unaffected block', () => {
    expect(() => applyDocBlockEdits([block('a'), block('kept')], [
      { type: 'replace', path: ['a'], blocks: [block('kept')] },
    ])).toThrow('Duplicate block ID "kept"');
  });

  it('allows deletion to produce an empty document', () => {
    const result = applyDocBlockEdits([block('only')], [{ type: 'delete', path: ['only'] }]);

    expect(result.blocks).toEqual([]);
  });
});
