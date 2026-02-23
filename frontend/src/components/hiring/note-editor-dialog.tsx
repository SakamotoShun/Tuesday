import { useState, useEffect } from "react"
import { type Block } from "@blocknote/core"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SimpleBlockNoteEditor } from "./simple-block-note-editor"
import { ApiErrorResponse } from "@/api/client"
import type { InterviewNote, CreateInterviewNoteInput, UpdateInterviewNoteInput } from "@/api/types"

interface NoteEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  note?: InterviewNote | null
  onSubmit: (data: CreateInterviewNoteInput | UpdateInterviewNoteInput) => Promise<void>
  isSubmitting?: boolean
}

export function NoteEditorDialog({
  open,
  onOpenChange,
  applicationId,
  note,
  onSubmit,
  isSubmitting,
}: NoteEditorDialogProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState<Block[]>([])
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!note

  useEffect(() => {
    if (!open) return
    if (note) {
      setTitle(note.title)
      setContent(note.content || [])
    } else {
      setTitle("")
      setContent([])
    }
    setError(null)
  }, [open, note])

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required")
      return
    }

    try {
      setError(null)
      if (isEdit) {
        await onSubmit({ title: title.trim(), content })
      } else {
        await onSubmit({
          applicationId,
          title: title.trim(),
          content,
        })
      }
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to save note")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Note" : "New Note"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="noteTitle">Title</Label>
            <Input
              id="noteTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <SimpleBlockNoteEditor
              key={note?.id || "new"}
              initialContent={content}
              onChange={setContent}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
