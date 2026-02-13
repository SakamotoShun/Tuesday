import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface TimesheetCellProps {
  value: number
  note?: string | null
  onChange?: (hours: number) => void
  onNoteChange?: (note: string) => void
  disabled?: boolean
  isTotal?: boolean
  alignCenter?: boolean
}

export function TimesheetCell({
  value,
  note,
  onChange,
  onNoteChange,
  disabled = false,
  isTotal = false,
  alignCenter = false,
}: TimesheetCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value ? value.toString() : "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditing) {
      setInputValue(value ? value.toString() : "")
    }
  }, [value, isEditing])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleFocus = () => {
    if (!disabled && !isTotal) {
      setIsEditing(true)
      setInputValue(value ? value.toString() : "")
    }
  }

  const handleBlur = () => {
    setIsEditing(false)
    if (!onChange) return
    const parsed = parseFloat(inputValue)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 24) {
      onChange(parsed)
    } else if (inputValue === "" || inputValue === "0") {
      onChange(0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur()
    } else if (e.key === "Escape") {
      setIsEditing(false)
      setInputValue(value ? value.toString() : "")
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setInputValue(val)
    }
  }

  if (isTotal) {
    return (
      <div className={cn(
        "px-2 py-1.5 font-medium tabular-nums text-sm",
        alignCenter ? "text-center" : "text-right",
        value === 0 && "text-muted-foreground"
      )}>
        {value > 0 ? value.toFixed(1) : "—"}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative px-0.5 py-0.5",
        disabled && "cursor-not-allowed opacity-50",
        note && "bg-amber-50 dark:bg-amber-950/20"
      )}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full h-7 px-1.5 text-center text-sm tabular-nums border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={disabled}
        />
      ) : (
        <button
          onClick={handleFocus}
          className={cn(
            "w-full h-7 px-1.5 text-center text-sm tabular-nums rounded hover:bg-muted transition-colors",
            value === 0 && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          {value > 0 ? value.toFixed(1) : "—"}
        </button>
      )}
      {note && !isEditing && (
        <div
          className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-amber-400 rounded-full"
          title={note}
        />
      )}
    </div>
  )
}
