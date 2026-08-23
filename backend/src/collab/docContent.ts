import { BlockNoteEditor } from '@blocknote/core';
import { blocksToYDoc, yDocToBlocks } from '@blocknote/core/yjs';
import * as Y from 'yjs';
import {
  DocBlockValidationError,
  normalizeLegacyDocBlocks,
  validateRawDocBlocks,
  type RawDocBlock,
} from '../utils/doc-blocks';

const editor = BlockNoteEditor.create();

export class DocBlockCanonicalizationError extends DocBlockValidationError {
  constructor(cause: unknown) {
    super('Blocks contain invalid BlockNote content', { cause });
    this.name = 'DocBlockCanonicalizationError';
  }
}

function roundTripNormalizedBlocks(blocks: RawDocBlock[]): RawDocBlock[] {
  let ydoc: Y.Doc;
  try {
    ydoc = blocksToYDoc(editor, blocks as never, 'prosemirror');
  } catch (cause) {
    throw new DocBlockCanonicalizationError(cause);
  }

  const canonical = yDocToBlocks(editor, ydoc, 'prosemirror');
  validateRawDocBlocks(canonical);
  return canonical;
}

export function blocksFromYDoc(doc: Y.Doc): RawDocBlock[] {
  return normalizeLegacyDocBlocks(yDocToBlocks(editor, doc, 'prosemirror'));
}

export function yDocFromBlocks(value: unknown): Y.Doc {
  const blocks = normalizeLegacyDocBlocks(value);
  // Runtime validation permits custom BlockNote fields that the built-in schema type cannot enumerate.
  return blocksToYDoc(editor, blocks as never, 'prosemirror');
}

export function canonicalizeDocBlocks(value: unknown): RawDocBlock[] {
  return roundTripNormalizedBlocks(normalizeLegacyDocBlocks(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function alignLegacyBlockIds(value: unknown, derived: RawDocBlock[]): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((block, index) => {
    if (!isRecord(block)) {
      return block;
    }
    const matching = typeof block.id === 'string' && block.id.length > 0
      ? derived.find((candidate) => candidate.id === block.id)
      : derived[index];
    if (!matching) {
      return block;
    }
    return {
      ...block,
      id: matching.id,
      children: alignLegacyBlockIds(block.children ?? [], matching.children),
    };
  });
}

export function mergeOpaqueBlockMetadata(derived: RawDocBlock[], previous: unknown): RawDocBlock[] {
  const previousBlocks = Array.isArray(previous) ? previous : [];
  return derived.map((block) => {
    const prior = previousBlocks.find((candidate) => isRecord(candidate) && candidate.id === block.id);
    if (!prior) {
      return block;
    }
    return {
      ...prior,
      ...block,
      props: {
        ...(isRecord(prior.props) ? prior.props : {}),
        ...block.props,
      },
      children: mergeOpaqueBlockMetadata(block.children, prior.children),
    } as RawDocBlock;
  });
}

export function canonicalizeDocBlocksForPersistence(value: unknown): RawDocBlock[] {
  const normalized = normalizeLegacyDocBlocks(value);
  return mergeOpaqueBlockMetadata(roundTripNormalizedBlocks(normalized), normalized);
}

export function assertDocBlocksCanonicalizable(value: unknown): void {
  canonicalizeDocBlocks(value);
}
