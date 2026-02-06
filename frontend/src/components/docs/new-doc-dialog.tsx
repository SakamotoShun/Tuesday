import { useState } from "react"
import type { ReactNode } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogTrigger,
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
import { ApiErrorResponse } from "@/api/client"
import type { CreateDocInput, Doc } from "@/api/types"

const docSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  parentId: z.string().optional().nullable(),
  type: z.enum(["doc", "database"]),
})

type DocForm = z.infer<typeof docSchema>

interface NewDocDialogProps {
  parentOptions: Doc[]
  onCreate: (data: CreateDocInput) => Promise<unknown>
  isSubmitting?: boolean
  trigger?: ReactNode
}

export function NewDocDialog({ parentOptions, onCreate, isSubmitting, trigger }: NewDocDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DocForm>({
    resolver: zodResolver(docSchema),
    defaultValues: {
      title: "",
      parentId: null,
      type: "doc",
    },
  })

  const handleCreate = async (data: DocForm) => {
    try {
      setError(null)
      const isDatabase = data.type === "database"
      await onCreate({
        title: data.title,
        parentId: data.parentId || null,
        isDatabase,
        schema: isDatabase ? { columns: [] } : null,
      })
      reset()
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to create doc")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-1">
            <Plus className="h-4 w-4" />
            New Doc
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create New Doc</DialogTitle>
          <DialogDescription>
            Start a new document and optionally place it under an existing doc.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleCreate)} className="space-y-4 py-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Project kickoff notes"
              {...register("title")}
              className={errors.title ? "border-destructive" : ""}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent">Parent Doc</Label>
            <Select
              value={watch("parentId") || "none"}
              onValueChange={(value) =>
                setValue("parentId", value === "none" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="No parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No parent</SelectItem>
                {parentOptions.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Doc Type</Label>
            <Select
              value={watch("type")}
              onValueChange={(value) => setValue("type", value as DocForm["type"])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="doc">Doc</SelectItem>
                <SelectItem value="database">Database</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Doc"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
