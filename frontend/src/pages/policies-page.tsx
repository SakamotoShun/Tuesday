import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { MoreHorizontal, Pencil, Plus, Table as TableIcon, Trash2 } from "@/lib/icons"
import { ApiErrorResponse } from "@/api/client"
import type { Doc } from "@/api/types"
import { useAuth } from "@/hooks/use-auth"
import { usePolicies } from "@/hooks/use-policies"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function PoliciesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const {
    databases,
    isLoading,
    createDatabase,
    updateDatabase,
    deleteDatabase,
  } = usePolicies()

  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)

  const [renameTarget, setRenameTarget] = useState<Doc | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [renameError, setRenameError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sortedDatabases = useMemo(() => {
    return [...databases].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [databases])

  const handleCreate = async () => {
    const title = createTitle.trim()
    if (!title) {
      setCreateError("Database name is required")
      return
    }

    try {
      setCreateError(null)
      const created = await createDatabase.mutateAsync({
        title,
        isDatabase: true,
        schema: { columns: [] },
      })
      setCreateOpen(false)
      setCreateTitle("")
      navigate(`/policies/${created.id}`)
    } catch (error) {
      if (error instanceof ApiErrorResponse) {
        setCreateError(error.message)
      } else {
        setCreateError("Failed to create database")
      }
    }
  }

  const handleRename = async () => {
    if (!renameTarget) return
    const title = renameTitle.trim()
    if (!title) {
      setRenameError("Database name is required")
      return
    }

    try {
      setRenameError(null)
      await updateDatabase.mutateAsync({ databaseId: renameTarget.id, data: { title } })
      setRenameTarget(null)
      setRenameTitle("")
    } catch (error) {
      if (error instanceof ApiErrorResponse) {
        setRenameError(error.message)
      } else {
        setRenameError("Failed to rename database")
      }
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      setDeleteError(null)
      await deleteDatabase.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      if (error instanceof ApiErrorResponse) {
        setDeleteError(error.message)
      } else {
        setDeleteError("Failed to delete database")
      }
    }
  }

  const handleCreateDialogOpenChange = (open: boolean) => {
    setCreateOpen(open)
    if (!open) {
      setCreateTitle("")
      setCreateError(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] font-bold">Internal Policies</h1>
          <p className="text-sm text-muted-foreground">
            Department policy databases. Everyone can view, admins can manage and edit.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Database
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[...Array(4)].map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : sortedDatabases.length === 0 ? (
          <div className="space-y-2 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">No policy databases yet.</p>
            {isAdmin && <p className="text-sm text-muted-foreground">Create one to get started.</p>}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedDatabases.map((database) => (
              <div key={database.id} className="flex items-center justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <Link to={`/policies/${database.id}`} className="line-clamp-1 font-medium hover:underline">
                    {database.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">Updated {formatUpdatedAt(database.updatedAt)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/policies/${database.id}`)}
                  >
                    Open
                  </Button>

                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameTarget(database)
                            setRenameTitle(database.title)
                            setRenameError(null)
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setDeleteTarget(database)
                            setDeleteError(null)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-primary" />
              Create Policy Database
            </DialogTitle>
            <DialogDescription>
              Create a department policy database. You can customize all columns after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="policy-database-name">Database name</Label>
              <Input
                id="policy-database-name"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleCreate()
                  }
                }}
                placeholder="e.g. HR Policies"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Use a department or function name. Employees will see this in Internal Policies.
              </p>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
          </div>

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => handleCreateDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={createDatabase.isPending}>
              {createDatabase.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null)
            setRenameTitle("")
            setRenameError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename database</DialogTitle>
            <DialogDescription>Update the database name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              autoFocus
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          </div>
          <DialogFooter className="mt-3">
            <Button
              variant="outline"
              onClick={() => {
                setRenameTarget(null)
                setRenameTitle("")
                setRenameError(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleRename()} disabled={updateDatabase.isPending}>
              {updateDatabase.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete database</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Delete ${deleteTarget.title} and all policy rows inside it? This cannot be undone.`
                : "This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter className="mt-3">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleteDatabase.isPending}>
              {deleteDatabase.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
