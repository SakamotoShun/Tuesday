import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import type { DatabaseSchema, SchemaColumn, PropertyType } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { PropertyTypeSelector } from "@/components/docs/property-type-selector"
import { cn } from "@/lib/utils"

interface SchemaEditorProps {
  schema: DatabaseSchema
  onSave: (schema: DatabaseSchema) => Promise<void>
  trigger?: React.ReactNode
}

const createColumnId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `col_${Date.now()}_${Math.random().toString(16).slice(2)}`

const createColumn = (): SchemaColumn => ({
  id: createColumnId(),
  name: "",
  type: "text",
})

export function SchemaEditor({ schema, onSave, trigger }: SchemaEditorProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DatabaseSchema>({ columns: [] })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft({ columns: schema?.columns ? [...schema.columns] : [] })
    setError(null)
  }, [open, schema])

  const hasColumns = draft.columns.length > 0

  const optionsSummary = useMemo(() => {
    return draft.columns.reduce<Record<string, string>>((acc, column) => {
      if (!column.options || column.options.length === 0) return acc
      acc[column.id] = column.options.join(", ")
      return acc
    }, {})
  }, [draft.columns])

  const handleAddColumn = () => {
    setDraft((current) => ({ ...current, columns: [...current.columns, createColumn()] }))
  }

  const handleRemoveColumn = (columnId: string) => {
    setDraft((current) => ({
      ...current,
      columns: current.columns.filter((column) => column.id !== columnId),
    }))
  }

  const handleMoveColumn = (columnId: string, direction: "up" | "down") => {
    setDraft((current) => {
      const index = current.columns.findIndex((column) => column.id === columnId)
      if (index === -1) return current
      const nextIndex = direction === "up" ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= current.columns.length) return current
      const nextColumns = [...current.columns]
      const [moved] = nextColumns.splice(index, 1)
      if (!moved) return current
      nextColumns.splice(nextIndex, 0, moved)
      return { ...current, columns: nextColumns }
    })
  }

  const handleUpdateColumn = (columnId: string, updates: Partial<SchemaColumn>) => {
    setDraft((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, ...updates } : column
      ),
    }))
  }

  const handleSave = async () => {
    const invalid = draft.columns.find((column) => !column.name.trim())
    if (invalid) {
      setError("Every column needs a name.")
      return
    }

    try {
      setError(null)
      await onSave(draft)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update schema")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            Edit Schema
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Edit Database Schema</DialogTitle>
          <DialogDescription>
            Add columns, choose property types, and reorder fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {draft.columns.map((column, index) => {
            const showOptions = column.type === "select" || column.type === "multi-select"
            return (
              <div
                key={column.id}
                className={cn(
                  "rounded-md border border-border p-3",
                  index % 2 === 0 ? "bg-muted/20" : "bg-card"
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[160px] space-y-1">
                    <Label>Column name</Label>
                    <Input
                      value={column.name}
                      onChange={(event) =>
                        handleUpdateColumn(column.id, { name: event.target.value })
                      }
                      placeholder="Status"
                    />
                  </div>

                  <div className="w-[180px] space-y-1">
                    <Label>Type</Label>
                    <PropertyTypeSelector
                      value={column.type}
                      onChange={(nextType) => {
                        const updates: Partial<SchemaColumn> = { type: nextType as PropertyType }
                        if (nextType !== "select" && nextType !== "multi-select") {
                          updates.options = undefined
                        }
                        handleUpdateColumn(column.id, updates)
                      }}
                    />
                  </div>

                  <div className="w-[120px] space-y-1">
                    <Label>Width</Label>
                    <Input
                      type="number"
                      value={column.width ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        handleUpdateColumn(column.id, {
                          width: nextValue ? Number(nextValue) : undefined,
                        })
                      }}
                      placeholder="240"
                    />
                  </div>

                  <div className="flex items-center gap-1 self-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleMoveColumn(column.id, "up")}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleMoveColumn(column.id, "down")}
                      disabled={index === draft.columns.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveColumn(column.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {showOptions && (
                  <div className="mt-3 space-y-1">
                    <Label>Options (comma separated)</Label>
                    <Input
                      value={optionsSummary[column.id] ?? ""}
                      onChange={(event) => {
                        const nextOptions = event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean)
                        handleUpdateColumn(column.id, { options: nextOptions })
                      }}
                      placeholder="Backlog, In Progress, Done"
                    />
                  </div>
                )}
              </div>
            )
          })}

          {!hasColumns && (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Add your first column to start tracking structured data.
            </div>
          )}

          <Button variant="outline" className="gap-2" onClick={handleAddColumn}>
            <Plus className="h-4 w-4" />
            Add column
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save schema</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
