import { useEffect, useMemo, useState } from "react"
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, type Block } from "@blocknote/core"
import { codeBlockOptions } from "@blocknote/code-block"
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  useCreateBlockNote,
} from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import "@blocknote/shadcn/style.css"
import { useUIStore } from "@/store/ui-store"

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
})

function CustomDragHandleMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>Delete</RemoveBlockItem>
      <BlockColorsItem>Colors</BlockColorsItem>
    </DragHandleMenu>
  )
}

interface SimpleBlockNoteEditorProps {
  initialContent?: Block[]
  onChange?: (content: Block[]) => void
  onBlur?: () => void
  editable?: boolean
}

export function SimpleBlockNoteEditor({
  initialContent,
  onChange,
  onBlur,
  editable = true,
}: SimpleBlockNoteEditorProps) {
  const editor = useCreateBlockNote({
    schema,
    editable,
    initialContent: initialContent && initialContent.length > 0 ? initialContent : undefined,
  })

  const themePreference = useUIStore((state) => state.theme)
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")

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

  return (
    <div
      className="rounded-lg border border-border bg-card px-4 py-6"
      onBlur={onBlur}
    >
      <BlockNoteView editor={editor} onChange={handleChange} theme={editorTheme} sideMenu={false} editable={editable}>
        {editable && (
          <SideMenuController
            sideMenu={(props) => <SideMenu {...props} dragHandleMenu={CustomDragHandleMenu} />}
          />
        )}
      </BlockNoteView>
    </div>
  )
}
