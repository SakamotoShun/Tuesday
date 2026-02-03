import { useState, type ChangeEvent } from "react"
import { NewProjectDialog } from "@/components/projects/new-project-dialog"
import { ProjectRow } from "@/components/projects/project-row"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjects } from "@/hooks/use-projects"

export function ProjectsPage() {
  const { projects, isLoading } = useProjects()
  const [statusFilter, setStatusFilter] = useState("all")
  const [ownerFilter, setOwnerFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const filteredProjects = projects.filter((project) => {
    if (statusFilter !== "all" && project.status?.name !== statusFilter) {
      return false
    }
    if (typeFilter !== "all" && project.type !== typeFilter) {
      return false
    }
    return true
  })

  const handleStatusChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value)
  }

  const handleOwnerChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setOwnerFilter(e.target.value)
  }

  const handleTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setTypeFilter(e.target.value)
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
        <Select
          value={statusFilter}
          onChange={handleStatusChange}
          className="w-[180px]"
        >
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Planning">Planning</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
        </Select>

        <Select
          value={ownerFilter}
          onChange={handleOwnerChange}
          className="w-[180px]"
        >
          <option value="all">All Owners</option>
          <option value="me">Me</option>
        </Select>

        <Select
          value={typeFilter}
          onChange={handleTypeChange}
          className="w-[180px]"
        >
          <option value="all">All Types</option>
          <option value="Client Project">Client Project</option>
          <option value="Internal">Internal</option>
          <option value="Research">Research</option>
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
            <ProjectRow key={project.id} project={project} />
          ))
        )}
      </div>
    </div>
  )
}
