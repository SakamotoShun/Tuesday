import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import type {
  CreateDocInput,
  DatabaseSchema,
  Doc,
  DocWithChildren,
  PropertyValue,
  SchemaColumn,
  UpdateDocInput,
} from "@/api/types"
import { ApiErrorResponse } from "@/api/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PropertyCell } from "@/components/docs/property-cell"
import { SchemaEditor } from "@/components/docs/schema-editor"
import { NewRowButton } from "@/components/docs/new-row-button"

interface DatabaseViewProps {
  doc: DocWithChildren
  getRowPath: (rowId: string) => string
  onUpdateRow: (rowId: string, data: UpdateDocInput) => Promise<Doc>
  onUpdateSchema: (docId: string, schema: DatabaseSchema) => Promise<Doc>
  onCreateRow: (data: CreateDocInput) => Promise<Doc>
  isCreating?: boolean
  readOnly?: boolean
}

const buildSchema = (schema: DatabaseSchema | null): DatabaseSchema => ({
  columns: schema?.columns ? [...schema.columns] : [],
})

const defaultValueForColumn = (column: SchemaColumn): PropertyValue => {
  switch (column.type) {
    case "text":
    case "url":
      return ""
    case "number":
    case "date":
    case "select":
      return null
    case "multi-select":
      return []
    case "checkbox":
      return false
    default:
      return null
  }
}

export function DatabaseView({
  doc,
  getRowPath,
  onUpdateRow,
  onUpdateSchema,
  onCreateRow,
  isCreating,
  readOnly = false,
}: DatabaseViewProps) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const schema = useMemo(() => buildSchema(doc.schema ?? null), [doc.schema])
  const rows = doc.children ?? []

  const handleUpdateRowProperty = useCallback(async (
    rowDoc: Doc,
    columnId: string,
    value: PropertyValue
  ) => {
    try {
      setError(null)
      const nextProperties = { ...(rowDoc.properties ?? {}) }
      nextProperties[columnId] = value
      await onUpdateRow(rowDoc.id, { properties: nextProperties })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update row")
      }
    }
  }, [onUpdateRow])

  const handleUpdateRowTitle = useCallback(async (rowDoc: Doc, value: PropertyValue) => {
    if (typeof value !== "string") return
    try {
      setError(null)
      await onUpdateRow(rowDoc.id, { title: value })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update row title")
      }
    }
  }, [onUpdateRow])

  const handleSchemaSave = useCallback(async (nextSchema: DatabaseSchema) => {
    try {
      setError(null)
      await onUpdateSchema(doc.id, nextSchema)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update schema")
      }
      throw err
    }
  }, [doc.id, onUpdateSchema])

  const handleCreateRow = useCallback(async () => {
    try {
      setError(null)
      const properties = schema.columns.reduce<Record<string, PropertyValue>>((acc, column) => {
        acc[column.id] = defaultValueForColumn(column)
        return acc
      }, {})
      const created = await onCreateRow({
        title: "Untitled",
        parentId: doc.id,
        properties,
      })
      return created
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to add row")
      }
      return undefined
    }
  }, [doc.id, onCreateRow, schema.columns])

  const handleCreateRowAsPage = useCallback(async () => {
    const created = await handleCreateRow()
    if (created) {
      navigate(getRowPath(created.id))
    }
  }, [getRowPath, handleCreateRow, navigate])

  const columns = useMemo<ColumnDef<Doc>[]>(() => {
    const base: ColumnDef<Doc>[] = [
      {
        id: "title",
        header: "Name",
        size: 240,
        cell: ({ row }: { row: { original: Doc } }) => (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <PropertyCell
                type="text"
                value={row.original.title}
                readOnly={readOnly}
                onCommit={(value) => handleUpdateRowTitle(row.original, value)}
              />
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate(getRowPath(row.original.id))}
            >
              Open
            </button>
          </div>
        ),
      },
    ]

    const schemaColumns = schema.columns.map((column) => ({
      id: column.id,
      header: column.name,
      size: column.width,
      cell: ({ row }: { row: { original: Doc } }) => (
        <PropertyCell
          type={column.type}
          value={row.original.properties?.[column.id] ?? null}
          options={column.options}
          readOnly={readOnly}
          onCommit={(value) => handleUpdateRowProperty(row.original, column.id, value)}
        />
      ),
    }))

    return base.concat(schemaColumns)
  }, [getRowPath, handleUpdateRowProperty, handleUpdateRowTitle, navigate, readOnly])

  const table = useReactTable<Doc>({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{rows.length} rows</div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <SchemaEditor schema={schema} onSave={handleSchemaSave} />
            <NewRowButton
              onAddRow={() => void handleCreateRow()}
              onAddAsPage={() => void handleCreateRowAsPage()}
              isSubmitting={isCreating}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={header.getSize() ? { width: header.getSize() } : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No rows yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
