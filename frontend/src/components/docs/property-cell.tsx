import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, ExternalLink } from "lucide-react"
import type { PropertyType, PropertyValue } from "@/api/types"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface PropertyCellProps {
  type: PropertyType
  value: PropertyValue
  options?: string[]
  placeholder?: string
  onCommit: (value: PropertyValue) => void
}

const EMPTY_LABEL = "—"

export function PropertyCell({
  type,
  value,
  options = [],
  placeholder = EMPTY_LABEL,
  onCommit,
}: PropertyCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<PropertyValue>(value ?? null)

  useEffect(() => {
    if (!isEditing) {
      setDraft(value ?? null)
    }
  }, [value, isEditing])

  const displayValue = useMemo(() => {
    if (value === null || value === undefined || value === "") {
      return placeholder
    }
    if (Array.isArray(value)) {
      return value.length ? value.join(", ") : placeholder
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No"
    }
    return String(value)
  }, [value, placeholder])

  const commitValue = (nextValue: PropertyValue) => {
    setIsEditing(false)
    onCommit(nextValue)
  }

  const handleInputCommit = () => {
    if (type === "number") {
      const parsed = typeof draft === "string" ? Number(draft) : Number(draft ?? "")
      if (Number.isNaN(parsed)) {
        commitValue(null)
        return
      }
      commitValue(parsed)
      return
    }

    if (type === "checkbox") {
      commitValue(Boolean(draft))
      return
    }

    commitValue((draft as string | null) ?? null)
  }

  if (type === "checkbox") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => commitValue(event.target.checked)}
          className="h-4 w-4 rounded border-muted-foreground/40"
        />
      </label>
    )
  }

  if (type === "select") {
    if (isEditing) {
      return (
        <Select
          open={isEditing}
          value={(typeof value === "string" ? value : "") || "none"}
          onValueChange={(nextValue) => {
            commitValue(nextValue === "none" ? null : nextValue)
          }}
          onOpenChange={(open) => setIsEditing(open)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No value</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    return (
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left",
          displayValue === placeholder ? "text-muted-foreground" : "text-foreground"
        )}
        onClick={() => setIsEditing(true)}
      >
        <span className="truncate">{displayValue}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
    )
  }

  if (type === "multi-select") {
    const selectedValues = Array.isArray(value) ? value : []

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 text-left",
              selectedValues.length === 0 ? "text-muted-foreground" : "text-foreground"
            )}
          >
            <span className="flex flex-wrap gap-1">
              {selectedValues.length === 0
                ? placeholder
                : selectedValues.map((item) => (
                    <Badge key={item} variant="secondary" className="text-xs">
                      {item}
                    </Badge>
                  ))}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[200px]">
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No options</div>
          )}
          {options.map((option) => {
            const isSelected = selectedValues.includes(option)
            return (
              <DropdownMenuItem
                key={option}
                onClick={(event) => {
                  event.preventDefault()
                  const nextValues = isSelected
                    ? selectedValues.filter((item) => item !== option)
                    : [...selectedValues, option]
                  commitValue(nextValues)
                }}
                className="flex items-center justify-between"
              >
                <span>{option}</span>
                {isSelected && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (isEditing) {
    const inputType = type === "number" ? "number" : type === "date" ? "date" : "text"
    const inputValue =
      draft === null || draft === undefined
        ? ""
        : Array.isArray(draft)
          ? draft.join(", ")
          : String(draft)

    return (
      <Input
        type={inputType}
        value={inputValue}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleInputCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            handleInputCommit()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            setIsEditing(false)
            setDraft(value ?? null)
          }
        }}
        className="h-8"
        autoFocus
      />
    )
  }

  if (type === "url" && typeof value === "string" && value) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex-1 truncate text-left"
          onClick={() => setIsEditing(true)}
        >
          {value}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          asChild
        >
          <a href={value} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center text-left",
        displayValue === placeholder ? "text-muted-foreground" : "text-foreground"
      )}
      onClick={() => setIsEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          setIsEditing(true)
        }
      }}
    >
      <span className="truncate">{displayValue}</span>
    </button>
  )
}
