import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react"
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, type Block } from "@blocknote/core"
import { codeBlockOptions } from "@blocknote/code-block"
import { SideMenuExtension } from "@blocknote/core/extensions"
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useExtensionState,
} from "@blocknote/react"
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

function CopyCodeBlockItem({ children }: { children: ReactNode }) {
  const Components = useComponentsContext()
  const editor = useBlockNoteEditor<any, any, any>()
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  })

  if (!Components || !block || block.type !== "codeBlock") {
    return null
  }

  const handleCopy = async () => {
    const text = Array.isArray(block.content)
      ? block.content
          .map((item) => {
            if (typeof item === "object" && item !== null && "text" in item) {
              return typeof item.text === "string" ? item.text : ""
            }
            return ""
          })
          .join("")
      : ""

    if (!navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(text)
  }

  return (
    <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => void handleCopy()}>
      {children}
    </Components.Generic.Menu.Item>
  )
}

function CustomDragHandleMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>Delete</RemoveBlockItem>
      <BlockColorsItem>Colors</BlockColorsItem>
      <CopyCodeBlockItem>Copy Code</CopyCodeBlockItem>
    </DragHandleMenu>
  )
}

interface BlockNoteEditorProps {
  docId: string
  initialContent: Block[]
  onChange?: (content: Block[]) => void
  onBlur?: () => void
  onSyncStateChange?: (state: "connecting" | "synced" | "error") => void
  editable?: boolean
}

export function BlockNoteEditor({
  docId,
  initialContent,
  onChange,
  onBlur,
  onSyncStateChange,
  editable = true,
}: BlockNoteEditorProps) {
  const editorRef = useRef<{ document: Block[] } | null>(null)
  const { ydoc, awareness, syncState, hasRemoteContent, initialSyncComplete, sendSnapshot } = useDocCollaboration(docId, {
    getSnapshotContent: () => editorRef.current?.document as Array<Record<string, unknown>>,
  })
  const fragment = useMemo(() => ydoc.getXmlFragment("prosemirror"), [ydoc])
  const editor = useCreateBlockNote({
    schema,
    editable,
    collaboration: {
      fragment,
      user: awareness.getLocalState()?.user ?? { name: "Anonymous", color: "#0F766E" },
      provider: { awareness },
      showCursorLabels: "always",
    },
  }, [fragment, awareness, editable])
  editorRef.current = editor
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

  const isEditorEditable = editable && initialSyncComplete

  const handleChange = () => {
    if (!initialSyncComplete) {
      return
    }

    onChange?.(editor.document)
  }

  useEffect(() => {
    onSyncStateChange?.(syncState)
  }, [onSyncStateChange, syncState])

  useEffect(() => {
    if (hasSeeded.current) return
    if (!initialSyncComplete) return
    if (hasRemoteContent) {
      hasSeeded.current = true
      return
    }

    if (initialContent.length === 0) {
      hasSeeded.current = true
      return
    }

    editor.replaceBlocks(editor.document, initialContent)
    hasSeeded.current = true
  }, [editor, hasRemoteContent, initialContent, initialSyncComplete])

  return (
    <div
      className="bn-cursor-labels-always rounded-lg border border-border bg-card px-4 py-6"
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return
        }

        if (initialSyncComplete) {
          sendSnapshot(editor.document as Array<Record<string, unknown>>)
        }
        onBlur?.()
      }}
    >
      <BlockNoteView editor={editor} onChange={handleChange} theme={resolvedTheme} sideMenu={false} editable={isEditorEditable}>
        {isEditorEditable && (
          <SideMenuController
            sideMenu={(props) => <SideMenu {...props} dragHandleMenu={CustomDragHandleMenu} />}
          />
        )}
      </BlockNoteView>
    </div>
  )
}
