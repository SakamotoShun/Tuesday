import type { Project, TaskStatus } from "@/api/types"
import { ItemCombobox } from "@/components/ui/item-combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Search } from "@/lib/icons"

interface TaskFiltersProps {
  projects: Project[]
  statuses: TaskStatus[]
  selectedProjectId: string | null
  selectedStatusId: string | null
  searchQuery: string
  showCompleted: boolean
  hasActiveFilters: boolean
  onProjectChange: (value: string | null) => void
  onStatusChange: (value: string | null) => void
  onSearchQueryChange: (value: string) => void
  onShowCompletedChange: (value: boolean) => void
  onClearFilters: () => void
}

export function TaskFilters({
  projects,
  statuses,
  selectedProjectId,
  selectedStatusId,
  searchQuery,
  showCompleted,
  hasActiveFilters,
  onProjectChange,
  onStatusChange,
  onSearchQueryChange,
  onShowCompletedChange,
  onClearFilters,
}: TaskFiltersProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.1fr]">
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

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background px-3 py-2">
        <label htmlFor="my-work-search" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Search tasks
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="my-work-search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Task title, project, status..."
            className="h-10 border-border bg-card pl-9"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showCompleted} onCheckedChange={onShowCompletedChange} />
            Include completed
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="h-8 px-2 text-xs"
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
