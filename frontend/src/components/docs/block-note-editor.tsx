import { useEffect, useMemo, useRef, useState } from "react"
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, type Block } from "@blocknote/core"
import { codeBlockOptions } from "@blocknote/code-block"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import "@blocknote/shadcn/style.css"
import { useUIStore } from "@/store/ui-store"
import { useDocCollaboration } from "@/hooks/use-doc-collaboration"

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
})

interface BlockNoteEditorProps {
  docId: string
  initialContent: Block[]
  onChange?: (content: Block[]) => void
  onBlur?: () => void
  onSyncStateChange?: (state: "connecting" | "synced" | "error") => void
}

export function BlockNoteEditor({
  docId,
  initialContent,
  onChange,
  onBlur,
  onSyncStateChange,
}: BlockNoteEditorProps) {
  const { ydoc, awareness, syncState, hasRemoteContent } = useDocCollaboration(docId)
  const fragment = useMemo(() => ydoc.getXmlFragment("prosemirror"), [ydoc])
  const editor = useCreateBlockNote({
    schema,
    collaboration: {
      fragment,
      user: awareness.getLocalState()?.user ?? { name: "Anonymous", color: "#0F766E" },
      provider: { awareness },
      showCursorLabels: "always",
    },
  }, [fragment, awareness])
  const themePreference = useUIStore((state) => state.theme)
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")
  const hasSeeded = useRef(false)

  useEffect(() => {
    if (themePreference === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)")
      const updateTheme = () => setResolvedTheme(media.matches ? "dark" : "light")
      updateTheme()
      media.addEventListener("change", updateTheme)
      return () => media.removeEventListener("change", updateTheme)
    }

    setResolvedTheme(themePreference)
    return undefined
  }, [themePreference])

  const editorTheme = useMemo(() => resolvedTheme, [resolvedTheme])

  const handleChange = () => {
    onChange?.(editor.document)
  }

  useEffect(() => {
    onSyncStateChange?.(syncState)
  }, [onSyncStateChange, syncState])

  useEffect(() => {
    if (hasSeeded.current) return
    if (hasRemoteContent) {
      hasSeeded.current = true
      return
    }
    if (initialContent.length === 0) return
    if (fragment.length > 0) {
      hasSeeded.current = true
      return
    }

    editor.replaceBlocks(editor.document, initialContent)
    hasSeeded.current = true
  }, [editor, fragment, hasRemoteContent, initialContent])

  return (
    <div
      className="bn-cursor-labels-always rounded-lg border border-border bg-card px-4 py-6"
      onBlur={onBlur}
    >
      <BlockNoteView editor={editor} onChange={handleChange} theme={editorTheme} />
    </div>
  )
}
