import type { Project, TaskStatus } from "@/api/types"
import { ItemCombobox } from "@/components/ui/item-combobox"
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
    <div className="grid gap-3 md:grid-cols-2">
      <ItemCombobox
        items={projects}
        value={selectedProjectId}
        onChange={onProjectChange}
        getItemId={(project) => project.id}
        getItemLabel={(project) => project.name}
        placeholder="All projects"
        searchPlaceholder="Search projects..."
        emptyLabel="No projects found"
        includeAllOption
        allLabel="All projects"
        className="h-11 w-full justify-between bg-background"
        contentClassName="w-[320px]"
      />

      <Select
        value={selectedStatusId ?? "all"}
        onValueChange={(value) => onStatusChange(value === "all" ? null : value)}
      >
        <SelectTrigger className="h-11 w-full bg-background">
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
