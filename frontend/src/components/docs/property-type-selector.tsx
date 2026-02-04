import { ListChecks, Link, Text, Hash, Calendar, CheckSquare, Check } from "lucide-react"
import type { PropertyType } from "@/api/types"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

const PROPERTY_TYPES: Array<{ value: PropertyType; label: string; icon: typeof Text }> = [
  { value: "text", label: "Text", icon: Text },
  { value: "number", label: "Number", icon: Hash },
  { value: "date", label: "Date", icon: Calendar },
  { value: "select", label: "Select", icon: CheckSquare },
  { value: "multi-select", label: "Multi-select", icon: ListChecks },
  { value: "checkbox", label: "Checkbox", icon: Check },
  { value: "url", label: "URL", icon: Link },
]

interface PropertyTypeSelectorProps {
  value: PropertyType
  onChange: (value: PropertyType) => void
}

export function PropertyTypeSelector({ value, onChange }: PropertyTypeSelectorProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as PropertyType)}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Select type" />
      </SelectTrigger>
      <SelectContent>
        {PROPERTY_TYPES.map((type) => {
          const Icon = type.icon
          return (
            <SelectItem key={type.value} value={type.value}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{type.label}</span>
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
