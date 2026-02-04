import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, FileText, Pencil, Table } from "lucide-react"
import type { Block } from "@blocknote/core"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { BlockNoteEditor } from "@/components/docs/block-note-editor"
import { DatabaseView } from "@/components/docs/database-view"
import { PropertiesPanel } from "@/components/docs/properties-panel"
import { DocToolbar } from "@/components/docs/doc-toolbar"
import { useDocWithChildren, useDocs } from "@/hooks/use-docs"
import type { PropertyValue } from "@/api/types"
import { ApiErrorResponse } from "@/api/client"

export function DocPage() {
  const { id: projectId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const { data: doc, isLoading, error } = useDocWithChildren(docId || "")
  const { updateDoc, deleteDoc } = useDocs(projectId || "")
  const [titleDraft, setTitleDraft] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")

  useEffect(() => {
    if (doc) {
      setTitleDraft(doc.title)
      setSaveState("saved")
      setTitleError(null)
      setIsEditingTitle(false)
    }
  }, [doc?.id])

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
    if (!doc || !projectId) return
    await deleteDoc.mutateAsync(doc.id)
    navigate(`/projects/${projectId}`)
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

  if (!doc || !projectId) {
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

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="gap-2 text-muted-foreground">
        <Link
          to={
            isDatabaseRow && parentDatabase
              ? `/projects/${projectId}/docs/${parentDatabase.id}`
              : `/projects/${projectId}`
          }
        >
          <ArrowLeft className="h-4 w-4" />
          {isDatabaseRow && parentDatabase ? `Back to ${parentDatabase.title}` : "Back to Docs"}
        </Link>
      </Button>

      <DocToolbar
        projectId={projectId}
        title={doc.title}
        saveState={saveState}
        onDelete={handleDelete}
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
                navigate(`/projects/${projectId}/docs/${parentDatabase.id}`)
              }
            />
          )}
          <BlockNoteEditor
            key={doc.id}
            docId={doc.id}
            initialContent={doc.content ?? []}
            onSyncStateChange={handleSyncStateChange}
          />
        </div>
      )}
    </div>
  )
}
