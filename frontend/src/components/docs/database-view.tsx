import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import type {
  DatabaseSchema,
  Doc,
  DocWithChildren,
  PropertyValue,
  SchemaColumn,
} from "@/api/types"
import { ApiErrorResponse } from "@/api/client"
import { useDocs } from "@/hooks/use-docs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PropertyCell } from "@/components/docs/property-cell"
import { SchemaEditor } from "@/components/docs/schema-editor"
import { NewRowButton } from "@/components/docs/new-row-button"

interface DatabaseViewProps {
  doc: DocWithChildren
  projectId: string | null
}

function getDocPath(projectId: string | null, docId: string) {
  if (projectId) {
    return `/projects/${projectId}/docs/${docId}`
  }
  return `/docs/personal/${docId}`
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

export function DatabaseView({ doc, projectId }: DatabaseViewProps) {
  const navigate = useNavigate()
  const { updateDoc, createDoc } = useDocs(projectId)
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
      await updateDoc.mutateAsync({ docId: rowDoc.id, data: { properties: nextProperties } })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update row")
      }
    }
  }, [updateDoc])

  const handleUpdateRowTitle = useCallback(async (rowDoc: Doc, value: PropertyValue) => {
    if (typeof value !== "string") return
    try {
      setError(null)
      await updateDoc.mutateAsync({ docId: rowDoc.id, data: { title: value } })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update row title")
      }
    }
  }, [updateDoc])

  const handleSchemaSave = useCallback(async (nextSchema: DatabaseSchema) => {
    try {
      setError(null)
      await updateDoc.mutateAsync({ docId: doc.id, data: { schema: nextSchema } })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update schema")
      }
      throw err
    }
  }, [doc.id, updateDoc])

  const handleCreateRow = useCallback(async () => {
    try {
      setError(null)
      const properties = schema.columns.reduce<Record<string, PropertyValue>>((acc, column) => {
        acc[column.id] = defaultValueForColumn(column)
        return acc
      }, {})
      const created = await createDoc.mutateAsync({
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
  }, [createDoc, doc.id, schema.columns])

  const handleCreateRowAsPage = useCallback(async () => {
    const created = await handleCreateRow()
    if (created) {
      navigate(getDocPath(projectId, created.id))
    }
  }, [handleCreateRow, navigate, projectId])

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
                onCommit={(value) => handleUpdateRowTitle(row.original, value)}
              />
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate(getDocPath(projectId, row.original.id))}
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
          onCommit={(value) => handleUpdateRowProperty(row.original, column.id, value)}
        />
      ),
    }))

    return base.concat(schemaColumns)
  }, [schema.columns, handleUpdateRowProperty, handleUpdateRowTitle])

  const table = useReactTable<Doc>({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{rows.length} rows</div>
        <div className="flex items-center gap-2">
          <SchemaEditor schema={schema} onSave={handleSchemaSave} />
          <NewRowButton
            onAddRow={() => void handleCreateRow()}
            onAddAsPage={() => void handleCreateRowAsPage()}
            isSubmitting={createDoc.isPending}
          />
        </div>
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
