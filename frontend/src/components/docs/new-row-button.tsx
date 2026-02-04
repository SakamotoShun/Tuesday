import { ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface NewRowButtonProps {
  onAddRow: () => void
  onAddAsPage: () => void
  isSubmitting?: boolean
}

export function NewRowButton({ onAddRow, onAddAsPage, isSubmitting }: NewRowButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={isSubmitting}>
          <Plus className="h-4 w-4" />
          {isSubmitting ? "Adding..." : "New row"}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuItem
          onClick={() => {
            if (!isSubmitting) onAddRow()
          }}
        >
          Add row
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (!isSubmitting) onAddAsPage()
          }}
        >
          Add as page
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
