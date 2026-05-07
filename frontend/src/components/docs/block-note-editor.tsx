import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react"
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, type Block } from "@blocknote/core"
import { blocksToYDoc } from "@blocknote/core/yjs"
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
import * as Y from "yjs"
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
  const isEditorReadyRef = useRef(false)
  const snapshotTimeoutRef = useRef<number | null>(null)
  const hasPendingSnapshotRef = useRef(false)
  const scheduleSnapshotRef = useRef<(() => void) | null>(null)
  const [isInitialDocumentReady, setIsInitialDocumentReady] = useState(false)
  const { ydoc, awareness, syncState, hasRemoteContent, initialSyncComplete, sendSnapshot } = useDocCollaboration(docId, {
    getSnapshotContent: () => editorRef.current?.document as Array<Record<string, unknown>>,
    onLocalChange: () => {
      if (!isEditorReadyRef.current) {
        return
      }

      onChange?.(editorRef.current?.document ?? [])
      scheduleSnapshotRef.current?.()
    },
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
  const isEditorReady = initialSyncComplete && isInitialDocumentReady

  useEffect(() => {
    hasSeeded.current = false
    setIsInitialDocumentReady(false)
    isEditorReadyRef.current = false
  }, [docId])

  useEffect(() => {
    isEditorReadyRef.current = isEditorReady
  }, [isEditorReady])

  const flushSnapshot = useCallback((contentOverride?: Block[]) => {
    if (!initialSyncComplete || syncState === "error") {
      return
    }

    if (snapshotTimeoutRef.current) {
      window.clearTimeout(snapshotTimeoutRef.current)
      snapshotTimeoutRef.current = null
    }

    hasPendingSnapshotRef.current = false
    sendSnapshot((contentOverride ?? editorRef.current?.document ?? []) as Array<Record<string, unknown>>)
  }, [initialSyncComplete, sendSnapshot, syncState])

  const scheduleSnapshot = useCallback(() => {
    if (!initialSyncComplete || syncState === "error") {
      return
    }

    hasPendingSnapshotRef.current = true
    if (snapshotTimeoutRef.current) {
      window.clearTimeout(snapshotTimeoutRef.current)
    }

    snapshotTimeoutRef.current = window.setTimeout(() => {
      flushSnapshot()
    }, 750)
  }, [flushSnapshot, initialSyncComplete, syncState])

  scheduleSnapshotRef.current = scheduleSnapshot

  useEffect(() => {
    onSyncStateChange?.(syncState)
  }, [onSyncStateChange, syncState])

  useEffect(() => {
    if (!initialSyncComplete) return

    if (hasRemoteContent) {
      hasSeeded.current = true
      setIsInitialDocumentReady(true)
      return
    }

    if (initialContent.length === 0) {
      hasSeeded.current = true
      setIsInitialDocumentReady(true)
      return
    }

    if (hasSeeded.current) return

    const seededDoc = blocksToYDoc(editor, initialContent, "prosemirror")
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seededDoc), "remote")
    flushSnapshot(initialContent)
    hasSeeded.current = true
    setIsInitialDocumentReady(true)
  }, [editor, flushSnapshot, hasRemoteContent, initialContent, initialSyncComplete, ydoc])

  useEffect(() => {
    const flushIfNeeded = () => {
      if (hasPendingSnapshotRef.current) {
        flushSnapshot()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushIfNeeded()
      }
    }

    window.addEventListener("beforeunload", flushIfNeeded)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      if (snapshotTimeoutRef.current) {
        window.clearTimeout(snapshotTimeoutRef.current)
      }
      window.removeEventListener("beforeunload", flushIfNeeded)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [flushSnapshot])

  return (
    <div
      className="bn-cursor-labels-always rounded-lg border border-border bg-card px-4 py-6"
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return
        }

        if (initialSyncComplete) {
          flushSnapshot()
        }
        onBlur?.()
      }}
    >
      {isEditorReady ? (
        <BlockNoteView editor={editor} theme={resolvedTheme} sideMenu={false} editable={isEditorEditable}>
          {isEditorEditable && (
            <SideMenuController
              sideMenu={(props) => <SideMenu {...props} dragHandleMenu={CustomDragHandleMenu} />}
            />
          )}
        </BlockNoteView>
      ) : (
        <div className="min-h-[160px] py-8 text-sm text-muted-foreground">
          {syncState === "error" ? "Failed to connect to collaborative editing." : "Loading document..."}
        </div>
      )}
    </div>
  )
}
