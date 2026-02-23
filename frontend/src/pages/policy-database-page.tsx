import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Pencil, Table as TableIcon } from "lucide-react"
import { ApiErrorResponse } from "@/api/client"
import { useAuth } from "@/hooks/use-auth"
import { usePolicyDatabase, usePolicies } from "@/hooks/use-policies"
import { DatabaseView } from "@/components/docs/database-view"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

export function PolicyDatabasePage() {
  const { id } = useParams<{ id: string }>()
  const databaseId = id ?? ""
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  const { data: database, isLoading, error } = usePolicyDatabase(databaseId)
  const { updateDatabase, createRow, updateRow } = usePolicies()

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [titleError, setTitleError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (error) {
    const message = error instanceof ApiErrorResponse ? error.message : "Failed to load database"
    return <Card className="bg-destructive/10 p-6 text-sm text-destructive">{message}</Card>
  }

  if (!database) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Database Not Found</h1>
        <Button asChild variant="outline">
          <Link to="/policies">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Internal Policies
          </Link>
        </Button>
      </div>
    )
  }

  const handleSaveTitle = async () => {
    if (!isAdmin) return

    const trimmed = titleDraft.trim()
    if (!trimmed) {
      setTitleError("Title is required")
      return
    }

    if (trimmed === database.title) {
      setIsEditingTitle(false)
      setTitleError(null)
      return
    }

    try {
      setTitleError(null)
      await updateDatabase.mutateAsync({ databaseId: database.id, data: { title: trimmed } })
      setIsEditingTitle(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setTitleError(err.message)
      } else {
        setTitleError("Failed to update title")
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/policies" className="hover:text-foreground">Internal Policies</Link>
          <span>/</span>
          <span className="text-foreground">{database.title}</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TableIcon className="h-4 w-4" />
          <span>Database</span>
          {!isAdmin && <span className="text-xs">(View only)</span>}
        </div>

        <div className="flex items-center gap-2">
          {isEditingTitle ? (
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
                  setTitleDraft(database.title)
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
                setTitleDraft(database.title)
                setIsEditingTitle(true)
              }}
            >
              <h1 className="font-serif text-[28px] font-bold">{database.title}</h1>
              {isAdmin && <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />}
            </button>
          )}
        </div>
        {titleError && <p className="text-sm text-destructive">{titleError}</p>}
      </div>

      <DatabaseView
        doc={database}
        getRowPath={(rowId) => `/policies/${database.id}/${rowId}`}
        onUpdateRow={(rowId, data) => updateRow.mutateAsync({ databaseId: database.id, rowId, data })}
        onUpdateSchema={(docId, schema) =>
          updateDatabase.mutateAsync({ databaseId: docId, data: { schema } })
        }
        onCreateRow={(data) => createRow.mutateAsync({ databaseId: database.id, data })}
        isCreating={createRow.isPending}
        readOnly={!isAdmin}
      />
    </div>
  )
}
