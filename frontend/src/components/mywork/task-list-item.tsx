import type { Task } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface TaskListItemProps {
  task: Task
  onSelect?: (task: Task) => void
}

export function TaskListItem({ task, onSelect }: TaskListItemProps) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null
  const isOverdue = dueDate ? dueDate < new Date() : false

  return (
    <button
      className={cn(
        "w-full text-left px-3 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors",
        isOverdue && "border-destructive/50"
      )}
      onClick={() => onSelect?.(task)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium break-words">{task.title}</div>
          <div className="text-xs text-muted-foreground">
            {task.project?.name ?? "Project"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.status && (
            <Badge variant="outline" style={{ borderColor: task.status.color, color: task.status.color }}>
              {task.status.name}
            </Badge>
          )}
          {dueDate && (
            <Badge variant={isOverdue ? "destructive" : "secondary"}>
              {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}
