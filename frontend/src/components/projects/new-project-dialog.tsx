import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, FileText, CheckSquare, MessageSquare, PenTool, LayoutTemplate } from "lucide-react"
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
import { useProjects, useProjectStatuses, useProjectTemplates } from "@/hooks/use-projects"
import { useTeams } from "@/hooks/use-teams"
import { useAuth } from "@/hooks/use-auth"
import * as teamsApi from "@/api/teams"
import { ApiErrorResponse } from "@/api/client"
import type { ProjectTemplate } from "@/api/types"

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(255),
  client: z.string().max(255).optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  statusId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  targetEndDate: z.string().optional().nullable(),
})

type ProjectForm = z.infer<typeof projectSchema>

export function NewProjectDialog() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string>("")
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null)
  const [step, setStep] = useState<"template" | "form">("template")
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const { createProject } = useProjects()
  const { data: statuses } = useProjectStatuses()
  const { data: templates } = useProjectTemplates()
  const { teams } = useTeams()

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

  useEffect(() => {
    if (!open) {
      setError(null)
      setSelectedTeamId("")
      setCreatedProjectId(null)
      setSelectedTemplate(null)
      setStep(templates && templates.length > 0 ? "template" : "form")
      reset()
    }
  }, [open, templates, reset])

  const handleSelectTemplate = (template: ProjectTemplate | null) => {
    setSelectedTemplate(template)
    if (template) {
      // Pre-fill type from template if available
      setValue("type", template.type || null)
    }
    setStep("form")
  }

  const onSubmit = async (data: ProjectForm) => {
    let projectId = createdProjectId
    try {
      setError(null)
      if (!projectId) {
        const project = await createProject.mutateAsync({
          name: data.name,
          client: data.client || undefined,
          type: data.type || undefined,
          statusId: data.statusId || undefined,
          startDate: data.startDate || undefined,
          targetEndDate: data.targetEndDate || undefined,
          templateId: selectedTemplate?.id,
        })
        projectId = project.id
        setCreatedProjectId(projectId)
      }

      if (isAdmin && selectedTeamId) {
        await teamsApi.assignProject(selectedTeamId, projectId)
      }

      reset()
      setSelectedTeamId("")
      setCreatedProjectId(null)
      setSelectedTemplate(null)
      setOpen(false)
    } catch (err) {
      if (projectId && !createdProjectId) {
        setCreatedProjectId(projectId)
      }
      if (err instanceof ApiErrorResponse) {
        if (projectId && isAdmin && selectedTeamId) {
          setError("Project created, but team assignment failed. Please retry.")
        } else {
          setError(err.message)
        }
      } else {
        if (projectId && isAdmin && selectedTeamId) {
          setError("Project created, but team assignment failed. Please retry.")
        } else {
          setError("Failed to create project")
        }
      }
    }
  }

  const hasTemplates = templates && templates.length > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className={step === "template" ? "sm:max-w-[600px]" : "sm:max-w-[500px]"}>
        <DialogHeader>
          <DialogTitle>
            {step === "template" ? "Choose a Template" : "Create New Project"}
          </DialogTitle>
          <DialogDescription>
            {step === "template"
              ? "Start with a template or create a blank project."
              : selectedTemplate
                ? `Creating from template: ${selectedTemplate.name}`
                : "Create a new project to start collaborating with your team."}
          </DialogDescription>
        </DialogHeader>

        {step === "template" ? (
          <div className="py-4 space-y-3">
            {/* Blank project option */}
            <button
              type="button"
              onClick={() => handleSelectTemplate(null)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-colors text-left"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <Plus className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">Blank Project</p>
                <p className="text-xs text-muted-foreground">Start from scratch</p>
              </div>
            </button>

            {/* Template options */}
            {templates?.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleSelectTemplate(template)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-colors text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <LayoutTemplate className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{template.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {template.docCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {template.docCount} {template.docCount === 1 ? "doc" : "docs"}
                      </span>
                    )}
                    {template.taskCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckSquare className="h-3 w-3" />
                        {template.taskCount} {template.taskCount === 1 ? "task" : "tasks"}
                      </span>
                    )}
                    {template.channelCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {template.channelCount} {template.channelCount === 1 ? "channel" : "channels"}
                      </span>
                    )}
                    {template.whiteboardCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <PenTool className="h-3 w-3" />
                        {template.whiteboardCount} {template.whiteboardCount === 1 ? "board" : "boards"}
                      </span>
                    )}
                    {template.docCount === 0 && template.taskCount === 0 && template.channelCount === 0 && template.whiteboardCount === 0 && (
                      <span className="text-xs text-muted-foreground">Empty template</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
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
                disabled={!!createdProjectId}
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">Client</Label>
                <Input
                  id="client"
                  placeholder="Acme Corp"
                  {...register("client")}
                  value={watch("client") || ""}
                  disabled={!!createdProjectId}
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
                  disabled={!!createdProjectId}
                  onChange={(e) => setValue("type", e.target.value || null)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Phase/Status</Label>
              <Select
                value={watch("statusId") || "none"}
                onValueChange={(value) =>
                  setValue("statusId", value === "none" ? null : value)
                }
                disabled={!!createdProjectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Phase</SelectItem>
                  {statuses?.map((status) => (
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
                  disabled={!!createdProjectId}
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
                  disabled={!!createdProjectId}
                  onChange={(e) =>
                    setValue("targetEndDate", e.target.value || null)
                  }
                />
              </div>
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="team">Assign Team</Label>
                <Select value={selectedTeamId || "none"} onValueChange={(value) => setSelectedTeamId(value === "none" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Team</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              {hasTemplates && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSelectedTemplate(null)
                    setStep("template")
                  }}
                  className="mr-auto"
                >
                  Back
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {createdProjectId
                  ? isSubmitting
                    ? "Assigning..."
                    : "Retry assignment"
                  : isSubmitting
                    ? "Creating..."
                    : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
