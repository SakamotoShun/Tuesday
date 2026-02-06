import { ArrowUpDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  DOC_SORT_DIRECTION_LABELS,
  DOC_SORT_FIELD_LABELS,
  type DocSortDirection,
  type DocSortField,
  type DocSortSettings,
} from "@/components/docs/doc-sorting"

interface DocSortControlProps {
  value: DocSortSettings
  onChange: (next: DocSortSettings) => void
}

const SORT_FIELDS: DocSortField[] = ["updatedAt", "createdAt", "title"]
const SORT_DIRECTIONS: DocSortDirection[] = ["desc", "asc"]

export function DocSortControl({ value, onChange }: DocSortControlProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Sort docs">
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Sort by</div>
        {SORT_FIELDS.map((field) => (
          <DropdownMenuItem
            key={field}
            onClick={() => {
              onChange({
                ...value,
                field,
              })
            }}
          >
            <Check className={value.field === field ? "mr-2 h-4 w-4" : "mr-2 h-4 w-4 opacity-0"} />
            {DOC_SORT_FIELD_LABELS[field]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Direction</div>
        {SORT_DIRECTIONS.map((direction) => (
          <DropdownMenuItem
            key={direction}
            onClick={() => {
              onChange({
                ...value,
                direction,
              })
            }}
          >
            <Check
              className={
                value.direction === direction ? "mr-2 h-4 w-4" : "mr-2 h-4 w-4 opacity-0"
              }
            />
            {DOC_SORT_DIRECTION_LABELS[direction]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
