import type { Block } from "@blocknote/core"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import "@blocknote/shadcn/style.css"

interface BlockNoteEditorProps {
  initialContent: Block[]
  onChange: (content: Block[]) => void
  onBlur?: () => void
}

export function BlockNoteEditor({ initialContent, onChange, onBlur }: BlockNoteEditorProps) {
  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
  })

  const handleChange = () => {
    onChange(editor.document)
  }

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-6" onBlur={onBlur}>
      <BlockNoteView editor={editor} onChange={handleChange} />
    </div>
  )
}
