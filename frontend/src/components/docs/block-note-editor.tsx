import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react"
import type { Block } from "@blocknote/core"
import { blocksToYDoc } from "@blocknote/core/yjs"
import { SideMenuExtension, TableHandlesExtension } from "@blocknote/core/extensions"
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
import { blockNoteSchema } from "./block-note-schema"

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
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const { ydoc, awareness, syncState, syncError, hasRemoteContent, initialSyncComplete, sendSnapshot, getRecoveryCopy } = useDocCollaboration(docId, {
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
    schema: blockNoteSchema,
    editable,
    collaboration: {
      fragment,
      user: awareness.getLocalState()?.user ?? { name: "Anonymous", color: "#0F766E" },
      provider: { awareness },
      showCursorLabels: "always",
    },
  }, [fragment, awareness])
  editorRef.current = editor
  const themePreference = useUIStore((state) => state.theme)
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")
  const hasSeeded = useRef(false)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const restoreEditorFocusRef = useRef(false)

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

  const isEditorEditable = editable && initialSyncComplete && !syncError
  const isEditorReady = isInitialDocumentReady
  // Read-only documents remain selectable and accessible. Inert is only a
  // temporary interaction lock for writable editors during transport recovery.
  const isTransportLocked = editable && !syncError && !initialSyncComplete

  // Changing BlockNoteView's editable prop replaces its mount callback ref.
  // Lock the existing ProseMirror view imperatively during transport recovery.
  useLayoutEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    // Capture focus before inert removes it. Keep ProseMirror's mapped selection
    // rather than saving numeric positions that remote edits could invalidate.
    if (isTransportLocked && !container.inert) {
      restoreEditorFocusRef.current = container.contains(document.activeElement)
      // Unmounting an open menu does not fire its onOpenChange(false). Release
      // extension-level hover locks too, so recovered handles follow the cursor.
      const tableHandles = editor.getExtension(TableHandlesExtension)
      tableHandles?.unfreezeHandles()
      tableHandles?.hideHandlesIfNotFrozen()
      const sideMenu = editor.getExtension(SideMenuExtension)
      // BlockNote's unfreezeMenu assumes a hover state exists. Keyboard-only
      // sessions (including touch devices) may never have created that state.
      if (sideMenu?.store.state) sideMenu.unfreezeMenu()
    }
    container.inert = isTransportLocked
    editor.isEditable = isEditorEditable
    if (isEditorEditable) {
      if (restoreEditorFocusRef.current) editor.focus()
      restoreEditorFocusRef.current = false
      return
    }

    // A deliberate focus/click elsewhere during recovery cancels restoration.
    // Browser-generated blur to body when inert is set does not.
    const cancelOutside = (event: Event) => {
      if (event.target instanceof Node && !container.contains(event.target)) {
        restoreEditorFocusRef.current = false
      }
    }
    const cancelRestore = () => { restoreEditorFocusRef.current = false }
    document.addEventListener("focusin", cancelOutside)
    document.addEventListener("pointerdown", cancelOutside, true)
    window.addEventListener("blur", cancelRestore)
    return () => {
      document.removeEventListener("focusin", cancelOutside)
      document.removeEventListener("pointerdown", cancelOutside, true)
      window.removeEventListener("blur", cancelRestore)
    }
  }, [editor, isEditorEditable, isEditorReady, isTransportLocked])

  useEffect(() => {
    setRecoveryDownloaded(false)
    setRecoveryError(null)
  }, [docId, syncError])

  const downloadRecovery = () => {
    try {
      const recovery = { ...getRecoveryCopy(), blocks: editor.document }
      const blob = new Blob([JSON.stringify(recovery, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `tuesday-doc-${docId}-recovery.json`
      document.body.appendChild(link)
      try {
        link.click()
      } finally {
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setRecoveryDownloaded(true)
      setRecoveryError(null)
    } catch {
      setRecoveryError("The recovery copy could not be downloaded. Keep this page open and try again, or copy the document text below.")
    }
  }

  useEffect(() => {
    hasSeeded.current = false
    setIsInitialDocumentReady(false)
    isEditorReadyRef.current = false
  }, [docId])

  useEffect(() => {
    isEditorReadyRef.current = isEditorReady
  }, [isEditorReady])

  const flushSnapshot = useCallback(() => {
    if (snapshotTimeoutRef.current) {
      window.clearTimeout(snapshotTimeoutRef.current)
      snapshotTimeoutRef.current = null
    }

    hasPendingSnapshotRef.current = false
    sendSnapshot()
  }, [sendSnapshot])

  const scheduleSnapshot = useCallback(() => {
    hasPendingSnapshotRef.current = true
    if (snapshotTimeoutRef.current) {
      window.clearTimeout(snapshotTimeoutRef.current)
    }

    snapshotTimeoutRef.current = window.setTimeout(() => {
      flushSnapshot()
    }, 750)
  }, [flushSnapshot])

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
    seededDoc.destroy()
    flushSnapshot()
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
      {syncError && (
        <div className="min-h-[160px] py-8 text-sm text-destructive" role="alert">
          <p>{syncError.message}</p>
          <p className="mt-2">The recovery file contains this local document and pending edits. Keep it for manual recovery; it will not be applied automatically.</p>
          <button className="mt-3 mr-4 font-medium underline underline-offset-4" type="button" onClick={downloadRecovery}>
            Download recovery copy
          </button>
          {recoveryDownloaded && <p role="status">Recovery download started. Check that the file was saved before reloading.</p>}
          {recoveryError && <p>{recoveryError}</p>}
          <button
            className="mt-3 font-medium underline underline-offset-4 disabled:opacity-50"
            type="button"
            disabled={syncError.pendingUpdateCount > 0 && !recoveryDownloaded}
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )}
      {isEditorReady && !syncError && !initialSyncComplete && (
        <p className="mb-3 text-sm text-muted-foreground" role="status">Connection lost. Reconnecting...</p>
      )}
      {isEditorReady ? (
        <div ref={editorContainerRef}>
          <BlockNoteView
            editor={editor}
            theme={resolvedTheme}
            sideMenu={false}
            editable={editable}
            formattingToolbar={isEditorEditable}
            linkToolbar={isEditorEditable}
            slashMenu={isEditorEditable}
            filePanel={isEditorEditable}
            tableHandles={isEditorEditable}
            emojiPicker={isEditorEditable}
            comments={isEditorEditable}
          >
            {isEditorEditable && (
              <SideMenuController
                sideMenu={(props) => <SideMenu {...props} dragHandleMenu={CustomDragHandleMenu} />}
              />
            )}
          </BlockNoteView>
        </div>
      ) : !syncError ? (
        <div className="min-h-[160px] py-8 text-sm text-muted-foreground">
          {syncState === "error" ? "Connection lost. Reconnecting..." : "Loading document..."}
        </div>
      ) : null}
    </div>
  )
}
