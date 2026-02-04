import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Table } from "lucide-react"
import type { DatabaseSchema, Doc, PropertyValue } from "@/api/types"
import { Button } from "@/components/ui/button"
import { PropertyCell } from "@/components/docs/property-cell"
import { cn } from "@/lib/utils"

interface PropertiesPanelProps {
  doc: Doc
  schema: DatabaseSchema
  onUpdate: (properties: Record<string, PropertyValue>) => Promise<void>
  onOpenDatabase?: () => void
}

export function PropertiesPanel({ doc, schema, onUpdate, onOpenDatabase }: PropertiesPanelProps) {
  const [isOpen, setIsOpen] = useState(true)

  const properties = useMemo(() => doc.properties ?? {}, [doc.properties])

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Table className="h-4 w-4 text-muted-foreground" />
          <span>Properties</span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenDatabase && (
            <Button variant="ghost" size="sm" onClick={onOpenDatabase}>
              Open database
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen((value) => !value)}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {isOpen && (
        <div className="divide-y divide-border">
          {schema.columns.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No properties defined yet.
            </div>
          ) : (
            schema.columns.map((column) => (
              <div key={column.id} className="grid grid-cols-[180px_1fr] items-center gap-3 px-4 py-3">
                <div className="text-sm text-muted-foreground">{column.name}</div>
                <div className={cn("text-sm", column.type === "checkbox" && "pt-1")}>
                  <PropertyCell
                    type={column.type}
                    value={properties[column.id] ?? null}
                    options={column.options}
                    onCommit={(value) =>
                      onUpdate({
                        ...properties,
                        [column.id]: value,
                      })
                    }
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
