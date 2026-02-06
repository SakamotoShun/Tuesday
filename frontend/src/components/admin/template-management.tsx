import { useState } from "react"
import { FileText, CheckSquare, MessageSquare, PenTool, LayoutTemplate, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAdminTemplates } from "@/hooks/use-admin"

export function TemplateManagement() {
  const { templates, projects, isLoading, toggleTemplate } = useAdminTemplates()
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")

  const handleMakeTemplate = async () => {
    if (!selectedProjectId) return
    try {
      await toggleTemplate.mutateAsync({ projectId: selectedProjectId, isTemplate: true })
      setSelectedProjectId("")
    } catch {
      // Error handled by mutation
    }
  }

  const handleRemoveTemplate = async (projectId: string) => {
    try {
      await toggleTemplate.mutateAsync({ projectId, isTemplate: false })
    } catch {
      // Error handled by mutation
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mark existing projects as templates. Template projects are hidden from the project list and
        available as blueprints when creating new projects. All docs, tasks, channels, and
        whiteboards from a template are cloned into the new project.
      </p>

      {/* Add template from existing project */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select
            value={selectedProjectId || "none"}
            onValueChange={(value) => setSelectedProjectId(value === "none" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a project to make a template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a project...</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleMakeTemplate}
          disabled={!selectedProjectId || toggleTemplate.isPending}
          size="sm"
        >
          <LayoutTemplate className="h-4 w-4 mr-1" />
          Make Template
        </Button>
      </div>

      {/* Current templates list */}
      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <LayoutTemplate className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No templates yet. Select a project above to create your first template.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{template.name}</p>
                <div className="flex items-center gap-3 mt-1">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveTemplate(template.id)}
                disabled={toggleTemplate.isPending}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
