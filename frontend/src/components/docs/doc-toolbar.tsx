import { useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, Check, CloudOff, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ApiErrorResponse } from "@/api/client"

type SaveState = "saved" | "saving" | "error"

interface DocToolbarProps {
  projectId: string
  title: string
  saveState: SaveState
  onDelete: () => Promise<void>
}

export function DocToolbar({ projectId, title, saveState, onDelete }: DocToolbarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      setError(null)
      await onDelete()
      setConfirmOpen(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to delete doc")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const saveLabel =
    saveState === "saving" ? "Saving..." : saveState === "error" ? "Save failed" : "Saved"

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to={`/projects/${projectId}`} className="hover:text-foreground">
          Docs
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium truncate max-w-[260px]">{title}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saveState === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saveState === "saved" && <Check className="h-3.5 w-3.5 text-emerald-500" />}
          {saveState === "error" && <CloudOff className="h-3.5 w-3.5 text-destructive" />}
          <span>{saveLabel}</span>
        </div>

        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Doc
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{title}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Doc"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
