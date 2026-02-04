import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiErrorResponse } from "@/api/client"

const whiteboardSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
})

type WhiteboardForm = z.infer<typeof whiteboardSchema>

interface NewWhiteboardDialogProps {
  onCreate: (name: string) => Promise<unknown>
}

export function NewWhiteboardDialog({ onCreate }: NewWhiteboardDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WhiteboardForm>({
    resolver: zodResolver(whiteboardSchema),
    defaultValues: {
      name: "",
    },
  })

  const handleCreate = async (data: WhiteboardForm) => {
    try {
      setError(null)
      await onCreate(data.name.trim())
      reset()
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to create whiteboard")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1">
          <Plus className="h-4 w-4" />
          New Whiteboard
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Whiteboard</DialogTitle>
          <DialogDescription>Start a fresh canvas for sketches and ideas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleCreate)} className="space-y-4 py-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="whiteboard-name">Name *</Label>
            <Input
              id="whiteboard-name"
              placeholder="Product brainstorm"
              {...register("name")}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Whiteboard"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
