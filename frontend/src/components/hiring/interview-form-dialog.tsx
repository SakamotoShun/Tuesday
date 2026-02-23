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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiErrorResponse } from "@/api/client"
import type { Interview, CreateInterviewInput, UpdateInterviewInput } from "@/api/types"

const schema = z.object({
  scheduledAt: z.string().optional(),
  durationMinutes: z.string().optional(),
  type: z.string().max(50).optional(),
  location: z.string().max(255).optional(),
  link: z.string().max(2048).optional(),
  rating: z.string().optional(),
  feedback: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface InterviewFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  interview?: Interview | null
  onSubmit: (data: CreateInterviewInput | UpdateInterviewInput) => Promise<void>
  onDelete?: (() => Promise<void>) | null
  isSubmitting?: boolean
}

export function InterviewFormDialog({
  open,
  onOpenChange,
  applicationId,
  interview,
  onSubmit,
  onDelete,
  isSubmitting,
}: InterviewFormDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!interview

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!open) return
    if (interview) {
      reset({
        scheduledAt: interview.scheduledAt
          ? new Date(interview.scheduledAt).toISOString().slice(0, 16)
          : "",
        durationMinutes: interview.durationMinutes?.toString() || "",
        type: interview.type || "",
        location: interview.location || "",
        link: interview.link || "",
        rating: interview.rating?.toString() || "",
        feedback: interview.feedback || "",
      })
    } else {
      reset({
        scheduledAt: "",
        durationMinutes: "",
        type: "",
        location: "",
        link: "",
        rating: "",
        feedback: "",
      })
    }
    setError(null)
  }, [open, interview, reset])

  const handleSave = async (data: FormData) => {
    try {
      setError(null)
      const payload: CreateInterviewInput | UpdateInterviewInput = {
        ...(isEdit ? {} : { applicationId }),
        scheduledAt: data.scheduledAt || null,
        durationMinutes: data.durationMinutes ? Number(data.durationMinutes) : null,
        type: data.type || null,
        location: data.location || null,
        link: data.link || null,
        rating: data.rating ? Number(data.rating) : null,
        feedback: data.feedback || null,
      }
      await onSubmit(payload)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to save interview")
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    try {
      await onDelete()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to delete interview")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Interview" : "Schedule Interview"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update interview details." : "Schedule a new interview session."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="type">Interview Type</Label>
            <Select
              value={watch("type") || ""}
              onValueChange={(val) => setValue("type", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Phone Screen">Phone Screen</SelectItem>
                <SelectItem value="Technical">Technical</SelectItem>
                <SelectItem value="Behavioral">Behavioral</SelectItem>
                <SelectItem value="System Design">System Design</SelectItem>
                <SelectItem value="Culture Fit">Culture Fit</SelectItem>
                <SelectItem value="Final Round">Final Round</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Date & Time</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                {...register("scheduledAt")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duration (min)</Label>
              <Input
                id="durationMinutes"
                type="number"
                placeholder="60"
                {...register("durationMinutes")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" placeholder="Office / Remote" {...register("location")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link">Meeting Link</Label>
            <Input id="link" placeholder="https://meet.google.com/..." {...register("link")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rating">Rating (1-5)</Label>
            <Select
              value={watch("rating")?.toString() || ""}
              onValueChange={(val) => setValue("rating", val || "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="No rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 - Poor</SelectItem>
                <SelectItem value="2">2 - Below Average</SelectItem>
                <SelectItem value="3">3 - Average</SelectItem>
                <SelectItem value="4">4 - Good</SelectItem>
                <SelectItem value="5">5 - Excellent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback">Feedback</Label>
            <Textarea
              id="feedback"
              placeholder="Interview feedback and notes..."
              rows={4}
              {...register("feedback")}
            />
          </div>

          <DialogFooter className="gap-2">
            {onDelete && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEdit ? "Update" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
