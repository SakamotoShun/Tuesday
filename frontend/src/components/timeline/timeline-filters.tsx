import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TaskStatus, User } from "@/api/types"

interface TimelineFiltersProps {
  statuses: TaskStatus[]
  selectedStatusIds: string[]
  onToggleStatus: (statusId: string) => void
  assignees: User[]
  selectedAssigneeId: string | null
  onAssigneeChange: (assigneeId: string | null) => void
  viewMode: "Day" | "Week" | "Month"
  onViewModeChange: (mode: "Day" | "Week" | "Month") => void
}

export function TimelineFilters({
  statuses,
  selectedStatusIds,
  onToggleStatus,
  assignees,
  selectedAssigneeId,
  onAssigneeChange,
  viewMode,
  onViewModeChange,
}: TimelineFiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Status
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => {
            const isActive = selectedStatusIds.includes(status.id)
            return (
              <Button
                key={status.id}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleStatus(status.id)}
                className="h-8"
              >
                {status.name}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Assignee
          </div>
          <Select
            value={selectedAssigneeId ?? "all"}
            onValueChange={(value) => onAssigneeChange(value === "all" ? null : value)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All assignees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {assignees.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            View
          </div>
          <Select value={viewMode} onValueChange={(value) => onViewModeChange(value as "Day" | "Week" | "Month")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Day">Day</SelectItem>
              <SelectItem value="Week">Week</SelectItem>
              <SelectItem value="Month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
