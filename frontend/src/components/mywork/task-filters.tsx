import type { Project, TaskStatus } from "@/api/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TaskFiltersProps {
  projects: Project[]
  statuses: TaskStatus[]
  selectedProjectId: string | null
  selectedStatusId: string | null
  onProjectChange: (value: string | null) => void
  onStatusChange: (value: string | null) => void
}

export function TaskFilters({
  projects,
  statuses,
  selectedProjectId,
  selectedStatusId,
  onProjectChange,
  onStatusChange,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <Select
        value={selectedProjectId ?? "all"}
        onValueChange={(value) => onProjectChange(value === "all" ? null : value)}
      >
        <SelectTrigger className="w-full md:w-60">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedStatusId ?? "all"}
        onValueChange={(value) => onStatusChange(value === "all" ? null : value)}
      >
        <SelectTrigger className="w-full md:w-52">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statuses.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              {status.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
