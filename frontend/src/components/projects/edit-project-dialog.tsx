import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Project, ProjectStatus, UpdateProjectInput } from "@/api/types"
import { ApiErrorResponse } from "@/api/client"

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(255),
  client: z.string().max(255).optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  statusId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  targetEndDate: z.string().optional().nullable(),
})

type ProjectForm = z.infer<typeof projectSchema>

interface EditProjectDialogProps {
  project: Project | null
  statuses: ProjectStatus[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: UpdateProjectInput) => Promise<void>
}

export function EditProjectDialog({
  project,
  statuses,
  open,
  onOpenChange,
  onSubmit,
}: EditProjectDialogProps) {
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      client: null,
      type: null,
      statusId: null,
      startDate: null,
      targetEndDate: null,
    },
  })

  // Populate form when project changes
  useEffect(() => {
    if (project && open) {
      reset({
        name: project.name,
        client: project.client,
        type: project.type,
        statusId: project.statusId,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
      })
    }
  }, [project, open, reset])

  const handleFormSubmit = async (data: ProjectForm) => {
    try {
      setError(null)
      await onSubmit({
        name: data.name,
        client: data.client,
        type: data.type,
        statusId: data.statusId,
        startDate: data.startDate,
        targetEndDate: data.targetEndDate,
      })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update project")
      }
    }
  }

  if (!project) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update the project details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 py-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input
              id="name"
              placeholder="Website Redesign 2024"
              {...register("name")}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client">Client</Label>
            <Input
              id="client"
              placeholder="Acme Corp"
              {...register("client")}
              value={watch("client") || ""}
              onChange={(e) => setValue("client", e.target.value || null)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Input
              id="type"
              placeholder="Client Project"
              {...register("type")}
              value={watch("type") || ""}
              onChange={(e) => setValue("type", e.target.value || null)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={watch("statusId") || "none"}
              onValueChange={(value) =>
                setValue("statusId", value === "none" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Status</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
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
              <Label htmlFor="targetEndDate">Target End Date</Label>
              <Input
                id="targetEndDate"
                type="date"
                {...register("targetEndDate")}
                value={watch("targetEndDate") || ""}
                onChange={(e) =>
                  setValue("targetEndDate", e.target.value || null)
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
