import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UserCombobox } from "@/components/ui/user-combobox"
import { usersApi } from "@/api/users"
import { ApiErrorResponse } from "@/api/client"
import type {
  NoticeBoardItem,
  CreateNoticeBoardItemInput,
  UpdateNoticeBoardItemInput,
} from "@/api/types"

const itemSchema = z.object({
  type: z.enum(["announcement", "todo"]),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(5000).optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
})

type ItemForm = z.infer<typeof itemSchema>

interface NoticeBoardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: NoticeBoardItem | null
  onCreate: (input: CreateNoticeBoardItemInput) => Promise<void>
  onUpdate: (id: string, input: UpdateNoticeBoardItemInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  isSaving?: boolean
}

export function NoticeBoardDialog({
  open,
  onOpenChange,
  item,
  onCreate,
  onUpdate,
  onDelete,
  isSaving = false,
}: NoticeBoardDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const usersQuery = useQuery({
    queryKey: ["users", "notice-board"],
    queryFn: usersApi.listMentionable,
    enabled: open,
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      type: "announcement",
      title: "",
      description: null,
      assigneeId: null,
    },
  })

  useEffect(() => {
    if (!open) return

    if (item) {
      reset({
        type: item.type,
        title: item.title,
        description: item.description,
        assigneeId: item.assigneeId,
      })
    } else {
      reset({
        type: "announcement",
        title: "",
        description: null,
        assigneeId: null,
      })
    }
    setError(null)
  }, [item, open, reset])

  const selectedType = watch("type")

  const handleSave = async (data: ItemForm) => {
    try {
      setError(null)

      if (item) {
        await onUpdate(item.id, {
          type: data.type,
          title: data.title,
          description: data.description,
          assigneeId: data.type === "todo" ? data.assigneeId ?? null : null,
        })
      } else {
        await onCreate({
          type: data.type,
          title: data.title,
          description: data.description,
          assigneeId: data.type === "todo" ? data.assigneeId ?? null : null,
        })
      }

      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to save notice board item")
      }
    }
  }

  const handleDelete = async () => {
    if (!item) return

    try {
      setIsDeleting(true)
      setError(null)
      await onDelete(item.id)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to delete notice board item")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Notice Board Item" : "Add Notice Board Item"}</DialogTitle>
          <DialogDescription>
            {item ? "Update this notice board item." : "Create an announcement or todo for the whole organization."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-4 py-2">
          {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={selectedType} onValueChange={(value: "announcement" | "todo") => setValue("type", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="announcement">Announcement</SelectItem>
                <SelectItem value="todo">Todo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-board-title">Title</Label>
            <Input id="notice-board-title" placeholder="Enter title..." {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-board-description">Description</Label>
            <Textarea
              id="notice-board-description"
              placeholder="Optional details..."
              {...register("description")}
              value={watch("description") ?? ""}
              onChange={(event) => setValue("description", event.target.value || null)}
              className="min-h-[100px]"
            />
          </div>

          {selectedType === "todo" && (
            <div className="space-y-2">
              <Label>Assignee</Label>
              <UserCombobox
                users={usersQuery.data ?? []}
                selectedIds={watch("assigneeId") ? [watch("assigneeId") as string] : []}
                onChange={(ids) => setValue("assigneeId", ids[0] ?? null)}
                mode="single"
                allowClear
                placeholder="Assign user..."
                searchPlaceholder="Search users..."
                emptyLabel="No users found"
                disabled={usersQuery.isLoading || isSubmitting || isSaving || isDeleting}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            {item && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={isSubmitting || isSaving || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || isSaving || isDeleting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isSaving || isDeleting}>
              {isSubmitting || isSaving ? "Saving..." : item ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
