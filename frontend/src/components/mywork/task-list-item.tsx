import type { Task } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { isCompletedStatus } from "@/lib/task-status"

interface TaskListItemProps {
  task: Task
  onSelect?: (task: Task) => void
}

export function TaskListItem({ task, onSelect }: TaskListItemProps) {
  const dueDate = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : null
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isCompleted = isCompletedStatus(task.status?.name)
  const isOverdue = dueDate ? dueDate < today : false
  const isDueToday = dueDate
    ? dueDate.getFullYear() === today.getFullYear() &&
      dueDate.getMonth() === today.getMonth() &&
      dueDate.getDate() === today.getDate()
    : false

  const dueLabel = dueDate
    ? dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null

  const dueTone = isCompleted
    ? "text-muted-foreground"
    : isOverdue
      ? "text-destructive"
      : isDueToday
        ? "text-secondary"
        : "text-muted-foreground"

  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg border bg-background px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
        isCompleted && "border-border/70 opacity-80",
        !isCompleted && "border-border hover:border-primary/35",
        isOverdue && "border-destructive/35"
      )}
      onClick={() => onSelect?.(task)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("break-words text-sm font-medium", isCompleted && "line-through")}>{task.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {task.project?.name ?? "Project"}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {task.status && (
            <Badge variant="outline" style={{ borderColor: task.status.color, color: task.status.color }}>
              {task.status.name}
            </Badge>
          )}

          {dueLabel && (
            <div
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium",
                isOverdue && !isCompleted && "border-destructive/40 bg-destructive/10 text-destructive",
                isDueToday && !isCompleted && "border-secondary/40 bg-secondary/10 text-secondary",
                !isOverdue && !isDueToday && "border-border bg-background",
                isCompleted && "border-border bg-background text-muted-foreground"
              )}
            >
              <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Due</span>
              <span className={dueTone}>{dueLabel}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
