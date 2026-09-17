import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from "@blocknote/core"
import { codeBlockOptions } from "@blocknote/code-block"

export const blockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
})
