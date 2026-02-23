import { useEffect, useState, type ChangeEvent } from "react"
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
import { deleteFile, uploadFile } from "@/api/files"
import type { Candidate, CreateCandidateInput } from "@/api/types"

const CANDIDATE_SOURCES = ["MyCareersFuture", "Referal", "Linkedin", "Others"] as const
type CandidateSourceOption = (typeof CANDIDATE_SOURCES)[number]

const schema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email").max(255).or(z.literal("")).optional(),
  phone: z.string().max(50).optional(),
  resumeUrl: z.string().max(2048).optional(),
  source: z.enum(CANDIDATE_SOURCES).optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const isCandidateSource = (value: string | null | undefined): value is CandidateSourceOption =>
  !!value && CANDIDATE_SOURCES.includes(value as CandidateSourceOption)

const getUploadedFileId = (url?: string | null): string | null => {
  if (!url) return null
  const match = url.match(/\/api\/v1\/files\/([0-9a-f-]{36})$/i)
  return match?.[1] ?? null
}

interface CandidateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidate?: Candidate | null
  onSubmit: (data: CreateCandidateInput) => Promise<void>
  onDelete?: (() => Promise<void>) | null
  isSubmitting?: boolean
}

export function CandidateFormDialog({
  open,
  onOpenChange,
  candidate,
  onSubmit,
  onDelete,
  isSubmitting,
}: CandidateFormDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [uploadedResume, setUploadedResume] = useState<{ id: string; url: string; name: string } | null>(null)
  const [isUploadingResume, setIsUploadingResume] = useState(false)
  const isEdit = !!candidate

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
      name: "",
      email: "",
      phone: "",
      resumeUrl: "",
      source: undefined,
      notes: "",
    },
  })

  const selectedSource = watch("source")
  const resumeUrl = watch("resumeUrl")

  useEffect(() => {
    if (!open) return

    if (candidate) {
      reset({
        name: candidate.name,
        email: candidate.email || "",
        phone: candidate.phone || "",
        resumeUrl: candidate.resumeUrl || "",
        source: isCandidateSource(candidate.source) ? candidate.source : undefined,
        notes: candidate.notes || "",
      })
    } else {
      reset({
        name: "",
        email: "",
        phone: "",
        resumeUrl: "",
        source: undefined,
        notes: "",
      })
    }

    setUploadedResume(null)
    setError(null)
  }, [open, candidate, reset])

  useEffect(() => {
    if (open || !uploadedResume) return

    void deleteFile(uploadedResume.id)
    setUploadedResume(null)
  }, [open, uploadedResume])

  const cleanupUnsavedUploadedResume = async () => {
    if (!uploadedResume) return
    await deleteFile(uploadedResume.id)
    setUploadedResume(null)
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (isSubmitting || isUploadingResume)) {
      return
    }

    if (!nextOpen) {
      void cleanupUnsavedUploadedResume()
    }
    onOpenChange(nextOpen)
  }

  const handleResumeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setIsUploadingResume(true)

    try {
      const uploaded = await uploadFile(file)

      if (uploadedResume) {
        await deleteFile(uploadedResume.id)
      }

      setUploadedResume({
        id: uploaded.id,
        url: uploaded.url,
        name: uploaded.originalName,
      })
      setValue("resumeUrl", uploaded.url, { shouldDirty: true })
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to upload resume")
    } finally {
      setIsUploadingResume(false)
      event.target.value = ""
    }
  }

  const handleResumeRemove = async () => {
    const currentFileId = getUploadedFileId(resumeUrl)
    if (uploadedResume && currentFileId === uploadedResume.id) {
      await deleteFile(uploadedResume.id)
      setUploadedResume(null)
    }

    setValue("resumeUrl", "", { shouldDirty: true })
  }

  const handleSave = async (data: FormData) => {
    try {
      setError(null)
      await onSubmit({
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        resumeUrl: data.resumeUrl || null,
        source: data.source ?? null,
        notes: data.notes || null,
      })
      setUploadedResume(null)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to save candidate")
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    try {
      await cleanupUnsavedUploadedResume()
      await onDelete()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to delete candidate")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Candidate" : "Add Candidate"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update candidate information." : "Add a new candidate to the system."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" placeholder="Full name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="email@example.com" {...register("email")} />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" placeholder="+65 9123 4567" {...register("phone")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Select
              value={selectedSource}
              onValueChange={(value) => setValue("source", value as CandidateSourceOption, { shouldDirty: true })}
            >
              <SelectTrigger id="source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {CANDIDATE_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.source && (
              <p className="text-xs text-destructive">{errors.source.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resume">Resume</Label>
            <Input
              id="resume"
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              onChange={(event) => {
                void handleResumeUpload(event)
              }}
              disabled={isSubmitting || isUploadingResume}
            />

            {resumeUrl ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <a
                  href={resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {uploadedResume?.name || "View uploaded resume"}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    void handleResumeRemove()
                  }}
                  disabled={isSubmitting || isUploadingResume}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                PDF, DOC, DOCX, TXT, or Markdown. Max 10MB.
              </p>
            )}

            {isUploadingResume && (
              <p className="text-xs text-muted-foreground">Uploading resume...</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Additional notes..." rows={3} {...register("notes")} />
          </div>

          <DialogFooter className="gap-2">
            {onDelete && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting || isUploadingResume}>
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={isUploadingResume}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isUploadingResume}>
              {isSubmitting ? "Saving..." : isEdit ? "Update" : "Add Candidate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
