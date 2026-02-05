import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface EditMessageFormProps {
  initialValue: string
  isSaving?: boolean
  error?: string | null
  onCancel: () => void
  onSave: (content: string) => Promise<unknown> | void
}

export function EditMessageForm({
  initialValue,
  isSaving = false,
  error,
  onCancel,
  onSave,
}: EditMessageFormProps) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const trimmed = value.trim()

  const handleSave = async () => {
    if (!trimmed) return
    await onSave(trimmed)
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="min-h-[72px]"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            handleSave()
          }
        }}
      />
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving || !trimmed}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">Press Esc to cancel, Cmd/Ctrl + Enter to save.</div>
    </div>
  )
}
