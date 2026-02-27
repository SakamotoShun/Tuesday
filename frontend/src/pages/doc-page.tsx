import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, FileText, Pencil, Table, X } from "@/lib/icons"
import type { Block } from "@blocknote/core"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BlockNoteEditor } from "@/components/docs/block-note-editor"
import { DatabaseView } from "@/components/docs/database-view"
import { PropertiesPanel } from "@/components/docs/properties-panel"
import { DocToolbar } from "@/components/docs/doc-toolbar"
import { DocSidebar } from "@/components/docs/doc-sidebar"
import { ResizableSplit } from "@/components/layout/resizable-split"
import { ChatView } from "@/components/chat/chat-view"
import { UserCombobox } from "@/components/ui/user-combobox"
import { useDocWithChildren, useDocs } from "@/hooks/use-docs"
import { useAuth } from "@/hooks/use-auth"
import { useDebounce } from "@/hooks/use-debounce"
import { useUIStore } from "@/store/ui-store"
import type { PropertyValue } from "@/api/types"
import { docsApi } from "@/api/docs"
import { usersApi } from "@/api/users"
import { ApiErrorResponse } from "@/api/client"

type PendingDocContent = {
  docId: string
  content: Block[]
}

export function shouldPersistDocContent({
  activeDocId,
  renderedDocId,
  targetDocId,
}: {
  activeDocId: string | null
  renderedDocId: string | null | undefined
  targetDocId: string
}) {
  return Boolean(renderedDocId && activeDocId === targetDocId && renderedDocId === targetDocId)
}

export function DocPage() {
  const queryClient = useQueryClient()
  const { id: routeProjectId, docId } = useParams<{ id?: string; docId: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const projectId = routeProjectId ?? null
  const fromHiring = searchParams.get("from") === "hiring" && user?.role === "admin"
  const navigate = useNavigate()
  const { data: doc, isLoading, error } = useDocWithChildren(docId || "")
  const { createDoc, updateDoc, deleteDoc } = useDocs(projectId)
  const [titleDraft, setTitleDraft] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [selectedShareUserIds, setSelectedShareUserIds] = useState<string[]>([])
  const [shareError, setShareError] = useState<string | null>(null)
  const [publicShareError, setPublicShareError] = useState<string | null>(null)
  const [copiedPublicLink, setCopiedPublicLink] = useState(false)
  const [pendingContent, setPendingContent] = useState<PendingDocContent | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeDocIdRef = useRef<string | null>(null)
  const pendingContentRef = useRef<PendingDocContent | null>(null)
  const lastSavedContentRef = useRef("[]")
  const isPersistingContentRef = useRef(false)
  const queuedContentRef = useRef<PendingDocContent | null>(null)
  const chatPanelWidth = useUIStore((state) => state.chatPanelWidth)
  const setChatPanelWidth = useUIStore((state) => state.setChatPanelWidth)
  const docSidebarWidth = useUIStore((state) => state.docSidebarWidth)
  const setDocSidebarWidth = useUIStore((state) => state.setDocSidebarWidth)
  const debouncedContent = useDebounce(pendingContent, 900)

  const mentionableUsersQuery = useQuery({
    queryKey: ["users", "mentionable"],
    queryFn: usersApi.listMentionable,
    enabled: shareDialogOpen,
  })

  const docSharesQuery = useQuery({
    queryKey: ["docs", doc?.id, "shares"],
    queryFn: () => docsApi.listShares(doc?.id ?? ""),
    enabled: shareDialogOpen && !!doc?.id,
  })

  const docShareLinkQuery = useQuery({
    queryKey: ["docs", doc?.id, "share-link"],
    queryFn: () => docsApi.getShareLink(doc?.id ?? ""),
    enabled: shareDialogOpen && !!doc?.id,
  })

  const updateShares = useMutation({
    mutationFn: ({ targetDocId, userIds }: { targetDocId: string; userIds: string[] }) =>
      docsApi.updateShares(targetDocId, { userIds }),
    onSuccess: (shares, variables) => {
      queryClient.setQueryData(["docs", variables.targetDocId, "shares"], shares)
      queryClient.invalidateQueries({ queryKey: ["docs", "personal"] })
    },
  })

  const createShareLink = useMutation({
    mutationFn: (targetDocId: string) => docsApi.createShareLink(targetDocId),
    onSuccess: (shareLink, targetDocId) => {
      queryClient.setQueryData(["docs", targetDocId, "share-link"], shareLink)
      setCopiedPublicLink(false)
    },
  })

  const deleteShareLink = useMutation({
    mutationFn: (targetDocId: string) => docsApi.deleteShareLink(targetDocId),
    onSuccess: (_, targetDocId) => {
      queryClient.setQueryData(["docs", targetDocId, "share-link"], null)
      setCopiedPublicLink(false)
    },
  })

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
      activeDocIdRef.current = doc.id
      setTitleDraft(doc.title)
      setSaveState("saved")
      setTitleError(null)
      setIsEditingTitle(false)
      setPendingContent(null)
      pendingContentRef.current = null
      queuedContentRef.current = null
      isPersistingContentRef.current = false
      lastSavedContentRef.current = JSON.stringify(doc.content ?? [])
      setShareDialogOpen(false)
      setSelectedShareUserIds([])
      setShareError(null)
      setPublicShareError(null)
      setCopiedPublicLink(false)
      return
    }

    activeDocIdRef.current = null
    isPersistingContentRef.current = false
  }, [doc?.id])

  useEffect(() => {
    if (!shareDialogOpen) {
      return
    }

    setShareError(null)
    setPublicShareError(null)
  }, [shareDialogOpen])

  useEffect(() => {
    setCopiedPublicLink(false)
  }, [docShareLinkQuery.data?.token])

  useEffect(() => {
    if (!shareDialogOpen) {
      return
    }

    const nextUserIds = (docSharesQuery.data ?? []).map((share) => share.userId)
    setSelectedShareUserIds(nextUserIds)
  }, [shareDialogOpen, docSharesQuery.data])

  const persistContent = useCallback(async (targetDocId: string, nextContent: Block[]) => {
    if (!shouldPersistDocContent({ activeDocId: activeDocIdRef.current, renderedDocId: doc?.id, targetDocId })) {
      return
    }

    const serialized = JSON.stringify(nextContent)
    if (serialized === lastSavedContentRef.current) {
      return
    }

    if (isPersistingContentRef.current) {
      queuedContentRef.current = { docId: targetDocId, content: nextContent }
      return
    }

    isPersistingContentRef.current = true
    setSaveState("saving")

    try {
      await updateDoc.mutateAsync({
        docId: targetDocId,
        data: { content: nextContent },
      })
      if (activeDocIdRef.current === targetDocId) {
        lastSavedContentRef.current = serialized
        setSaveState("saved")
      }
    } catch {
      if (activeDocIdRef.current === targetDocId) {
        setSaveState("error")
      }
    } finally {
      isPersistingContentRef.current = false

      const queuedContent = queuedContentRef.current
      queuedContentRef.current = null

      if (queuedContent) {
        void persistContent(queuedContent.docId, queuedContent.content)
      }
    }
  }, [doc, updateDoc])

  useEffect(() => {
    if (!debouncedContent) return
    if (!shouldPersistDocContent({ activeDocId: activeDocIdRef.current, renderedDocId: doc?.id, targetDocId: debouncedContent.docId })) {
      return
    }
    void persistContent(debouncedContent.docId, debouncedContent.content)
  }, [debouncedContent, doc?.id, persistContent])

  const handleContentChange = useCallback((nextContent: Block[]) => {
    if (!doc) return
    const contentState = { docId: doc.id, content: nextContent }
    pendingContentRef.current = contentState
    setPendingContent(contentState)
  }, [doc])

  const handleContentBlur = useCallback(() => {
    const pendingContentState = pendingContentRef.current
    if (!pendingContentState) return
    void persistContent(pendingContentState.docId, pendingContentState.content)
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
    navigate(projectId ? `/projects/${projectId}` : fromHiring ? "/hiring" : "/")
  }

  const handleSaveShares = async () => {
    if (!doc || !canManageShares) return

    try {
      setShareError(null)
      await updateShares.mutateAsync({
        targetDocId: doc.id,
        userIds: selectedShareUserIds,
      })
      setShareDialogOpen(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setShareError(err.message)
      } else {
        setShareError("Failed to update sharing settings")
      }
    }
  }

  const handleCreateShareLink = async () => {
    if (!doc || !canManageShares) return

    try {
      setPublicShareError(null)
      await createShareLink.mutateAsync(doc.id)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setPublicShareError(err.message)
      } else {
        setPublicShareError("Failed to create public link")
      }
    }
  }

  const handleDeleteShareLink = async () => {
    if (!doc || !canManageShares) return

    try {
      setPublicShareError(null)
      await deleteShareLink.mutateAsync(doc.id)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setPublicShareError(err.message)
      } else {
        setPublicShareError("Failed to disable public link")
      }
    }
  }

  const handleCopyShareLink = async (url: string) => {
    if (!navigator.clipboard) {
      setPublicShareError("Clipboard is not available in this browser")
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopiedPublicLink(true)
      setPublicShareError(null)
    } catch {
      setPublicShareError("Failed to copy link")
    }
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

  const canManageShares = projectId
    ? Boolean(user)
    : Boolean(user && (user.role === "admin" || user.id === doc.createdBy))

  const shareLinkUrl = docShareLinkQuery.data
    ? `${window.location.origin}/shared/docs/${docShareLinkQuery.data.token}`
    : ""

  const canDeleteDoc = projectId
    ? true
    : Boolean(user && (user.role === "admin" || user.id === doc.createdBy))

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

  const breadcrumbHref = projectId ? `/projects/${projectId}` : fromHiring ? "/hiring" : "/"
  const breadcrumbLabel = projectId ? "Docs" : fromHiring ? "Hiring" : "Personal Docs"

  const docContent = (
    <div className="space-y-4 p-1">
      <DocToolbar
        breadcrumbHref={breadcrumbHref}
        breadcrumbLabel={breadcrumbLabel}
        title={doc.title}
        saveState={saveState}
        onDelete={handleDelete}
        canDelete={canDeleteDoc}
        onOpenShare={canManageShares ? () => setShareDialogOpen(true) : undefined}
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
        <DatabaseView
          doc={doc}
          getRowPath={(rowId) => getDocPath(projectId, rowId)}
          onUpdateRow={(rowId, data) => updateDoc.mutateAsync({ docId: rowId, data })}
          onUpdateSchema={(databaseId, schema) =>
            updateDoc.mutateAsync({ docId: databaseId, data: { schema } })
          }
          onCreateRow={(data) => createDoc.mutateAsync(data)}
          isCreating={createDoc.isPending}
        />
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

  const shareDialog = canManageShares ? (
    <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Share Doc</DialogTitle>
          <DialogDescription>
            Invite workspace members and optionally create a public view-only link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {shareError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {shareError}
            </div>
          )}

          {publicShareError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {publicShareError}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Workspace access</p>
            <p className="text-xs text-muted-foreground">Selected users can edit this doc.</p>

            <UserCombobox
              users={mentionableUsersQuery.data ?? []}
              selectedIds={selectedShareUserIds}
              onChange={setSelectedShareUserIds}
              mode="multiple"
              placeholder="Select users..."
              searchPlaceholder="Search users..."
              emptyLabel="No users found"
              disabled={
                mentionableUsersQuery.isLoading ||
                docSharesQuery.isLoading ||
                updateShares.isPending
              }
              contentClassName="w-[360px]"
            />
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Public link (view only)</p>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view this doc without signing in.
            </p>

            {docShareLinkQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading public link...</p>
            ) : docShareLinkQuery.data ? (
              <div className="space-y-2">
                <Input readOnly value={shareLinkUrl} className="text-sm" />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyShareLink(shareLinkUrl)}
                    disabled={deleteShareLink.isPending}
                  >
                    {copiedPublicLink ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDeleteShareLink()}
                    disabled={deleteShareLink.isPending}
                  >
                    {deleteShareLink.isPending ? "Disabling..." : "Disable link"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCreateShareLink()}
                disabled={createShareLink.isPending}
              >
                {createShareLink.isPending ? "Creating..." : "Create public link"}
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShareDialogOpen(false)}
            disabled={updateShares.isPending || createShareLink.isPending || deleteShareLink.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSaveShares()}
            disabled={updateShares.isPending || createShareLink.isPending || deleteShareLink.isPending}
          >
            {updateShares.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  if (!projectId) {
    return (
      <>
        <div className="rounded-lg border border-border bg-background p-4">
          {docContent}
        </div>
        {shareDialog}
      </>
    )
  }

  return (
    <>
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
      {shareDialog}
    </>
  )
}

function getDocPath(projectId: string | null, docId: string) {
  if (projectId) {
    return `/projects/${projectId}/docs/${docId}`
  }

  return `/docs/personal/${docId}`
}
