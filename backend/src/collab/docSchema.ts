import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from '@blocknote/core';
import { codeBlockOptions } from '@blocknote/code-block';

// Keep in parity with frontend/src/components/docs/block-note-schema.ts.
export const docSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, codeBlock: createCodeBlockSpec(codeBlockOptions) },
});
