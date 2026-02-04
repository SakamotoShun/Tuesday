import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { NewProjectDialog } from "@/components/projects/new-project-dialog"
import { EditProjectDialog } from "@/components/projects/edit-project-dialog"
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog"
import { ProjectRow } from "@/components/projects/project-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjects, useProjectStatuses } from "@/hooks/use-projects"
import type { Project, UpdateProjectInput } from "@/api/types"

export function ProjectsPage() {
  const navigate = useNavigate()
  const { projects, isLoading, updateProject, deleteProject } = useProjects()
  const { data: projectStatuses } = useProjectStatuses()
  const [statusFilter, setStatusFilter] = useState("all")
  const [ownerFilter, setOwnerFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const filteredProjects = projects.filter((project) => {
    if (statusFilter !== "all" && project.status?.name !== statusFilter) {
      return false
    }
    if (typeFilter !== "all" && project.type !== typeFilter) {
      return false
    }
    return true
  })

  const handleEditClick = (project: Project) => {
    setSelectedProject(project)
    setIsEditDialogOpen(true)
  }

  const handleDeleteClick = (project: Project) => {
    setSelectedProject(project)
    setIsDeleteDialogOpen(true)
  }

  const handleEditSubmit = async (data: UpdateProjectInput) => {
    if (!selectedProject) return
    await updateProject.mutateAsync({ id: selectedProject.id, data })
    setIsEditDialogOpen(false)
    setSelectedProject(null)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedProject) return
    await deleteProject.mutateAsync(selectedProject.id)
    setIsDeleteDialogOpen(false)
    setSelectedProject(null)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-serif text-[32px] font-bold">Projects</h1>
        <NewProjectDialog />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Planning">Planning</SelectItem>
            <SelectItem value="On Hold">On Hold</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            <SelectItem value="me">Me</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Client Project">Client Project</SelectItem>
            <SelectItem value="Internal">Internal</SelectItem>
            <SelectItem value="Research">Research</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project List */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No projects found</p>
            <p className="text-sm">Create your first project to get started</p>
          </div>
        ) : (
          filteredProjects.map((project) => (
            <ProjectRow 
              key={project.id} 
              project={project} 
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
            />
          ))
        )}
      </div>

      {/* Edit Project Dialog */}
      <EditProjectDialog
        project={selectedProject}
        statuses={projectStatuses || []}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSubmit={handleEditSubmit}
      />

      {/* Delete Project Dialog */}
      <DeleteProjectDialog
        project={selectedProject}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
