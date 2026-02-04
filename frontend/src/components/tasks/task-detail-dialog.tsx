import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Trash2, Calendar, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AssigneePicker } from "./assignee-picker"
import type { Task, TaskStatus, UpdateTaskInput, User } from "@/api/types"
import { ApiErrorResponse } from "@/api/client"

const taskSchema = z.object({
  title: z.string().min(1, "Task title is required").max(255),
  description: z.string().max(10000).optional().nullable(),
  statusId: z.string().min(1, "Status is required"),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()),
})

type TaskForm = z.infer<typeof taskSchema>

interface TaskDetailDialogProps {
  task: Task | null
  statuses: TaskStatus[]
  members: User[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: UpdateTaskInput) => Promise<void>
  onDelete?: (() => Promise<void>) | null
  isSubmitting?: boolean
}

export function TaskDetailDialog({
  task,
  statuses,
  members,
  open,
  onOpenChange,
  onSubmit,
  onDelete,
  isSubmitting = false,
}: TaskDetailDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting: formIsSubmitting },
  } = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: null,
      statusId: "",
      startDate: null,
      dueDate: null,
      assigneeIds: [],
    },
  })

  // Populate form when task changes
  useEffect(() => {
    if (task && open) {
      const fallbackStatusId = statuses[0]?.id
      reset({
        title: task.title,
        description: task.description,
        statusId: task.statusId ?? fallbackStatusId ?? "",
        startDate: task.startDate,
        dueDate: task.dueDate,
        assigneeIds: task.assignees?.map((a) => a.id) || [],
      })
    }
  }, [task, open, reset, statuses])

  const handleFormSubmit = async (data: TaskForm) => {
    try {
      setError(null)
      await onSubmit({
        title: data.title,
        description: data.description,
        statusId: data.statusId,
        startDate: data.startDate,
        dueDate: data.dueDate,
        assigneeIds: data.assigneeIds,
      })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update task")
      }
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    try {
      setIsDeleting(true)
      await onDelete()
      setShowDeleteConfirm(false)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to delete task")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GripVertical className="h-5 w-5 text-muted-foreground" />
            Task Details
          </DialogTitle>
          <DialogDescription>
            View and edit task details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 py-4">
          {error && !showDeleteConfirm && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              placeholder="Enter task title..."
              {...register("title")}
              className={errors.title ? "border-destructive" : ""}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Add a description..."
              {...register("description")}
              value={watch("description") || ""}
              onChange={(e) => setValue("description", e.target.value || null)}
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              Markdown formatting supported
            </p>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={watch("statusId") || statuses[0]?.id || ""}
              onValueChange={(value) => setValue("statusId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                      {status.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.statusId && (
              <p className="text-sm text-destructive">{errors.statusId.message}</p>
            )}
          </div>

          {/* Assignees */}
          <div className="space-y-2">
            <Label>Assignees</Label>
            <AssigneePicker
              members={members}
              selectedIds={watch("assigneeIds")}
              onChange={(ids) => setValue("assigneeIds", ids)}
              disabled={isSubmitting || formIsSubmitting}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Start Date
              </Label>
              <Input
                id="startDate"
                type="date"
                {...register("startDate")}
                value={watch("startDate") || ""}
                onChange={(e) =>
                  setValue("startDate", e.target.value || null)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Due Date
              </Label>
              <Input
                id="dueDate"
                type="date"
                {...register("dueDate")}
                value={watch("dueDate") || ""}
                onChange={(e) =>
                  setValue("dueDate", e.target.value || null)
                }
              />
            </div>
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && onDelete && (
            <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive mb-3">
                Are you sure you want to delete this task? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete Task"}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {onDelete && !showDeleteConfirm && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSubmitting || formIsSubmitting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || formIsSubmitting || isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || formIsSubmitting || isDeleting}
            >
              {isSubmitting || formIsSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
