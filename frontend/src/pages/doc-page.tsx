import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, FileText, Pencil, Table, X } from "lucide-react"
import type { Block } from "@blocknote/core"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { BlockNoteEditor } from "@/components/docs/block-note-editor"
import { DatabaseView } from "@/components/docs/database-view"
import { PropertiesPanel } from "@/components/docs/properties-panel"
import { DocToolbar } from "@/components/docs/doc-toolbar"
import { DocSidebar } from "@/components/docs/doc-sidebar"
import { ResizableSplit } from "@/components/layout/resizable-split"
import { ChatView } from "@/components/chat/chat-view"
import { useDocWithChildren, useDocs } from "@/hooks/use-docs"
import { useDebounce } from "@/hooks/use-debounce"
import { useUIStore } from "@/store/ui-store"
import type { PropertyValue } from "@/api/types"
import { ApiErrorResponse } from "@/api/client"

export function DocPage() {
  const { id: routeProjectId, docId } = useParams<{ id?: string; docId: string }>()
  const projectId = routeProjectId ?? null
  const navigate = useNavigate()
  const { data: doc, isLoading, error } = useDocWithChildren(docId || "")
  const { updateDoc, deleteDoc } = useDocs(projectId)
  const [titleDraft, setTitleDraft] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [pendingContent, setPendingContent] = useState<Block[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingContentRef = useRef<Block[] | null>(null)
  const lastSavedContentRef = useRef("[]")
  const isPersistingContentRef = useRef(false)
  const queuedContentRef = useRef<Block[] | null>(null)
  const chatPanelWidth = useUIStore((state) => state.chatPanelWidth)
  const setChatPanelWidth = useUIStore((state) => state.setChatPanelWidth)
  const docSidebarWidth = useUIStore((state) => state.docSidebarWidth)
  const setDocSidebarWidth = useUIStore((state) => state.setDocSidebarWidth)
  const debouncedContent = useDebounce(pendingContent, 900)

  const handleSidebarResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setIsResizingSidebar(true)
  }, [])

  useEffect(() => {
    if (!isResizingSidebar) return

    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = event.clientX - containerRect.left
      const clampedWidth = Math.min(480, Math.max(180, newWidth))
      setDocSidebarWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizingSidebar, setDocSidebarWidth])

  useEffect(() => {
    if (doc) {
      setTitleDraft(doc.title)
      setSaveState("saved")
      setTitleError(null)
      setIsEditingTitle(false)
      setPendingContent(null)
      pendingContentRef.current = null
      queuedContentRef.current = null
      lastSavedContentRef.current = JSON.stringify(doc.content ?? [])
    }
  }, [doc?.id])

  const persistContent = useCallback(async (nextContent: Block[]) => {
    if (!doc) return

    const serialized = JSON.stringify(nextContent)
    if (serialized === lastSavedContentRef.current) {
      return
    }

    if (isPersistingContentRef.current) {
      queuedContentRef.current = nextContent
      return
    }

    isPersistingContentRef.current = true
    setSaveState("saving")

    try {
      await updateDoc.mutateAsync({
        docId: doc.id,
        data: { content: nextContent },
      })
      lastSavedContentRef.current = serialized
      setSaveState("saved")
    } catch {
      setSaveState("error")
    } finally {
      isPersistingContentRef.current = false

      const queuedContent = queuedContentRef.current
      queuedContentRef.current = null

      if (queuedContent) {
        void persistContent(queuedContent)
      }
    }
  }, [doc, updateDoc])

  useEffect(() => {
    if (!debouncedContent) return
    void persistContent(debouncedContent)
  }, [debouncedContent, persistContent])

  const handleContentChange = useCallback((nextContent: Block[]) => {
    pendingContentRef.current = nextContent
    setPendingContent(nextContent)
  }, [])

  const handleContentBlur = useCallback(() => {
    if (!pendingContentRef.current) return
    void persistContent(pendingContentRef.current)
  }, [persistContent])

  const handleTitleSave = async () => {
    if (!doc) return
    const trimmed = titleDraft.trim()
    if (!trimmed) {
      setTitleError("Title is required")
      return
    }

    if (trimmed === doc.title) {
      setIsEditingTitle(false)
      setTitleError(null)
      return
    }

    try {
      setSaveState("saving")
      await updateDoc.mutateAsync({ docId: doc.id, data: { title: trimmed } })
      setSaveState("saved")
      setIsEditingTitle(false)
      setTitleError(null)
    } catch (err) {
      setSaveState("error")
      if (err instanceof ApiErrorResponse) {
        setTitleError(err.message)
      } else {
        setTitleError("Failed to update title")
      }
    }
  }

  const handleDelete = async () => {
    if (!doc) return
    await deleteDoc.mutateAsync(doc.id)
    navigate(projectId ? `/projects/${projectId}` : "/")
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    const message = error instanceof ApiErrorResponse ? error.message : "Failed to load doc"
    return (
      <Card className="p-6 text-sm text-destructive bg-destructive/10">
        {message}
      </Card>
    )
  }

  if (!doc) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Doc Not Found</h1>
        <Button asChild variant="outline">
          <Link to="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
      </div>
    )
  }

  const isDatabaseRow = Boolean(doc.parentId && doc.parent?.isDatabase)
  const parentDatabase = doc.parent?.isDatabase ? doc.parent : null

  const handlePropertiesUpdate = async (nextProperties: Record<string, PropertyValue>) => {
    await updateDoc.mutateAsync({
      docId: doc.id,
      data: { properties: nextProperties },
    })
  }

  const handleSyncStateChange = (state: "connecting" | "synced" | "error") => {
    // Only update save state for connection status, not on every sync
    if (state === "error") {
      setSaveState("error")
    } else if (state === "synced" && saveState === "error") {
      // Recover from error state when reconnected
      setSaveState("saved")
    }
  }

  const chatPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="text-sm font-semibold">Project Chat</div>
        <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <ChatView projectId={projectId || ""} variant="panel" />
      </div>
    </div>
  )

  const breadcrumbHref = projectId ? `/projects/${projectId}` : "/"
  const breadcrumbLabel = projectId ? "Docs" : "Personal Docs"

  const docContent = (
    <div className="space-y-4 p-1">
      <DocToolbar
        breadcrumbHref={breadcrumbHref}
        breadcrumbLabel={breadcrumbLabel}
        title={doc.title}
        saveState={saveState}
        onDelete={handleDelete}
        onOpenChat={projectId ? () => setIsChatOpen(true) : undefined}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {doc.isDatabase ? (
            <Table className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          <span>{doc.isDatabase ? "Database" : isDatabaseRow ? "Row" : "Doc"}</span>
          {isDatabaseRow && parentDatabase && (
            <span className="text-xs text-muted-foreground/70">
              in {parentDatabase.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <Input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void handleTitleSave()
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setTitleDraft(doc.title)
                  setIsEditingTitle(false)
                  setTitleError(null)
                }
              }}
              className="text-[28px] font-serif font-bold h-12"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="group flex items-center gap-2"
              onClick={() => setIsEditingTitle(true)}
            >
              <h1 className="font-serif text-[28px] font-bold">{doc.title}</h1>
              <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </button>
          )}
        </div>
        {titleError && (
          <p className="text-sm text-destructive">{titleError}</p>
        )}
      </div>

      {doc.isDatabase ? (
        <DatabaseView doc={doc} projectId={projectId} />
      ) : (
        <div className="space-y-4">
          {isDatabaseRow && parentDatabase?.schema && (
            <PropertiesPanel
              doc={doc}
              schema={parentDatabase.schema}
              onUpdate={handlePropertiesUpdate}
              onOpenDatabase={() =>
                navigate(getDocPath(projectId, parentDatabase.id))
              }
            />
          )}
          <BlockNoteEditor
            key={doc.id}
            docId={doc.id}
            initialContent={doc.content ?? []}
            onChange={handleContentChange}
            onBlur={handleContentBlur}
            onSyncStateChange={handleSyncStateChange}
          />
        </div>
      )}
    </div>
  )

  if (!projectId) {
    return (
      <div className="rounded-lg border border-border bg-background p-4">
        {docContent}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 border border-border rounded-lg overflow-hidden bg-background ${
        isResizingSidebar ? "select-none" : ""
      }`}
      style={{ height: "calc(100vh - 72px - 4rem)" }}
    >
      <DocSidebar projectId={projectId} activeDocId={doc.id} width={docSidebarWidth} />
      <div
        className={`w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors ${
          isResizingSidebar ? "bg-primary" : ""
        }`}
        onMouseDown={handleSidebarResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize docs sidebar"
      />
      <div className="flex-1 min-w-0">
        <ResizableSplit
          sidePanel={chatPanel}
          sidePanelOpen={isChatOpen}
          sidePanelWidth={chatPanelWidth}
          onWidthChange={setChatPanelWidth}
          minWidth={300}
          maxWidth={700}
        >
          {docContent}
        </ResizableSplit>
      </div>
    </div>
  )
}

function getDocPath(projectId: string | null, docId: string) {
  if (projectId) {
    return `/projects/${projectId}/docs/${docId}`
  }

  return `/docs/personal/${docId}`
}
