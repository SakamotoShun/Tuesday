import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Check, CloudOff, FileText, Loader2, Pencil, Trash2 } from "lucide-react"
import type { Block } from "@blocknote/core"
import { ApiErrorResponse } from "@/api/client"
import type { PropertyValue } from "@/api/types"
import { useAuth } from "@/hooks/use-auth"
import { useDebounce } from "@/hooks/use-debounce"
import { usePolicies, usePolicyRow } from "@/hooks/use-policies"
import { BlockNoteEditor } from "@/components/docs/block-note-editor"
import { PropertiesPanel } from "@/components/docs/properties-panel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

type SaveState = "saved" | "saving" | "error"

export function PolicyDocPage() {
  const { id, rowId } = useParams<{ id: string; rowId: string }>()
  const databaseId = id ?? ""
  const policyRowId = rowId ?? ""
  const navigate = useNavigate()

  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  const { data: doc, isLoading, error } = usePolicyRow(databaseId, policyRowId)
  const { updateRow, deleteRow } = usePolicies()

  const [titleDraft, setTitleDraft] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [pendingContent, setPendingContent] = useState<Block[] | null>(null)

  const pendingContentRef = useRef<Block[] | null>(null)
  const lastSavedContentRef = useRef("[]")
  const isPersistingContentRef = useRef(false)
  const queuedContentRef = useRef<Block[] | null>(null)

  const debouncedContent = useDebounce(pendingContent, 900)

  useEffect(() => {
    if (!doc) return

    setTitleDraft(doc.title)
    setIsEditingTitle(false)
    setTitleError(null)
    setSaveState("saved")
    setPendingContent(null)
    pendingContentRef.current = null
    queuedContentRef.current = null
    lastSavedContentRef.current = JSON.stringify(doc.content ?? [])
  }, [doc?.id])

  const persistContent = useCallback(async (nextContent: Block[]) => {
    if (!doc || !isAdmin) return

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
      await updateRow.mutateAsync({
        databaseId,
        rowId: doc.id,
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
  }, [databaseId, doc, isAdmin, updateRow])

  useEffect(() => {
    if (!isAdmin || !debouncedContent) return
    void persistContent(debouncedContent)
  }, [debouncedContent, isAdmin, persistContent])

  const handleContentChange = useCallback((nextContent: Block[]) => {
    if (!isAdmin) return
    pendingContentRef.current = nextContent
    setPendingContent(nextContent)
  }, [isAdmin])

  const handleContentBlur = useCallback(() => {
    if (!isAdmin || !pendingContentRef.current) return
    void persistContent(pendingContentRef.current)
  }, [isAdmin, persistContent])

  const handleSaveTitle = async () => {
    if (!doc || !isAdmin) return

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
      await updateRow.mutateAsync({
        databaseId,
        rowId: doc.id,
        data: { title: trimmed },
      })
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
    if (!doc || !isAdmin) return
    await deleteRow.mutateAsync({ databaseId, rowId: doc.id })
    navigate(`/policies/${databaseId}`)
  }

  const handlePropertiesUpdate = async (nextProperties: Record<string, PropertyValue>) => {
    if (!doc || !isAdmin) return

    await updateRow.mutateAsync({
      databaseId,
      rowId: doc.id,
      data: { properties: nextProperties },
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    const message = error instanceof ApiErrorResponse ? error.message : "Failed to load policy"
    return <Card className="bg-destructive/10 p-6 text-sm text-destructive">{message}</Card>
  }

  if (!doc || doc.parentId !== databaseId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Policy Not Found</h1>
        <Button asChild variant="outline">
          <Link to="/policies">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Internal Policies
          </Link>
        </Button>
      </div>
    )
  }

  const saveLabel =
    saveState === "saving"
      ? "Saving..."
      : saveState === "error"
        ? "Save failed"
        : "Saved"

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/policies" className="hover:text-foreground">Internal Policies</Link>
            <span>/</span>
            <Link to={`/policies/${databaseId}`} className="hover:text-foreground">
              {doc.parent?.title ?? "Database"}
            </Link>
            <span>/</span>
            <span className="text-foreground">{doc.title}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {saveState === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saveState === "saved" && <Check className="h-3.5 w-3.5 text-emerald-500" />}
              {saveState === "error" && <CloudOff className="h-3.5 w-3.5 text-destructive" />}
              <span>{isAdmin ? saveLabel : "View only"}</span>
            </div>

            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => void handleDelete()}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Policy</span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && isEditingTitle ? (
              <Input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => void handleSaveTitle()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleSaveTitle()
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setTitleDraft(doc.title)
                    setIsEditingTitle(false)
                    setTitleError(null)
                  }
                }}
                className="h-12 text-[28px] font-serif font-bold"
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="group flex items-center gap-2"
                onClick={() => {
                  if (!isAdmin) return
                  setIsEditingTitle(true)
                }}
              >
                <h1 className="font-serif text-[28px] font-bold">{doc.title}</h1>
                {isAdmin && <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />}
              </button>
            )}
          </div>

          {titleError && <p className="text-sm text-destructive">{titleError}</p>}
        </div>

        {doc.parent?.schema && (
          <PropertiesPanel
            doc={doc}
            schema={doc.parent.schema}
            onUpdate={handlePropertiesUpdate}
            onOpenDatabase={() => navigate(`/policies/${databaseId}`)}
            readOnly={!isAdmin}
          />
        )}

        <BlockNoteEditor
          key={doc.id}
          docId={doc.id}
          initialContent={doc.content ?? []}
          onChange={isAdmin ? handleContentChange : undefined}
          onBlur={isAdmin ? handleContentBlur : undefined}
          editable={isAdmin}
        />
      </div>
    </div>
  )
}
