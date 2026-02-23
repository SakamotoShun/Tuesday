import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiErrorResponse } from "@/api/client"
import type { JobPosition, CreateJobPositionInput } from "@/api/types"

const schema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  department: z.string().max(100).optional(),
  status: z.enum(["open", "on_hold", "closed"]),
})

type FormData = z.infer<typeof schema>

interface PositionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  position?: JobPosition | null
  onSubmit: (data: CreateJobPositionInput) => Promise<void>
  onDelete?: (() => Promise<void>) | null
  isSubmitting?: boolean
}

export function PositionFormDialog({
  open,
  onOpenChange,
  position,
  onSubmit,
  onDelete,
  isSubmitting,
}: PositionFormDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!position

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      department: "",
      status: "open",
    },
  })

  useEffect(() => {
    if (!open) return
    if (position) {
      reset({
        title: position.title,
        department: position.department || "",
        status: position.status,
      })
    } else {
      reset({
        title: "",
        department: "",
        status: "open",
      })
    }
    setError(null)
  }, [open, position, reset])

  const handleSave = async (data: FormData) => {
    try {
      setError(null)
      await onSubmit(data)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to save position")
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    try {
      await onDelete()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to delete position")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Position" : "Create Position"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update job position details." : "Create a new job position / role."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="e.g. Senior Frontend Engineer"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              placeholder="e.g. Engineering"
              {...register("department")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={watch("status")}
              onValueChange={(val) => setValue("status", val as "open" | "on_hold" | "closed")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            {onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
