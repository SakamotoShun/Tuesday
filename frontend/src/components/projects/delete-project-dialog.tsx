import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import type { Project } from "@/api/types"
import { ApiErrorResponse } from "@/api/client"

interface DeleteProjectDialogProps {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onConfirm,
}: DeleteProjectDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationValue, setConfirmationValue] = useState("")

  const normalizedProjectName = useMemo(() => {
    return project?.name.trim().toLowerCase() || ""
  }, [project?.name])

  const normalizedConfirmation = useMemo(() => {
    return confirmationValue.trim().toLowerCase()
  }, [confirmationValue])

  const isConfirmationValid = normalizedConfirmation.length > 0 && normalizedConfirmation === normalizedProjectName

  useEffect(() => {
    if (!open) {
      setConfirmationValue("")
      setError(null)
      return
    }
    setConfirmationValue("")
  }, [open, project?.name])

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      setError(null)
      await onConfirm()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to delete project")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (!project) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Project
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be undone.
            Type the project name to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-delete-confirmation">Project name</Label>
            <Input
              id="project-delete-confirmation"
              value={confirmationValue}
              onChange={(event) => setConfirmationValue(event.target.value)}
              placeholder={project.name}
              disabled={isDeleting}
            />
            {confirmationValue.length > 0 && !isConfirmationValid && (
              <p className="text-sm text-muted-foreground">
                Enter the exact project name to enable deletion.
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmationValid || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
