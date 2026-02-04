import type { Task } from "@/api/types"
import { Badge } from "@/components/ui/badge"

interface TasksDueSoonProps {
  tasks: Task[]
}

export function TasksDueSoon({ tasks }: TasksDueSoonProps) {
  if (tasks.length === 0) {
    return <div className="text-sm text-muted-foreground">No tasks due soon.</div>
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{task.title}</div>
            <div className="text-xs text-muted-foreground">
              {task.project?.name ?? "Project"}
            </div>
          </div>
          {task.dueDate && (
            <Badge variant="secondary">
              {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Badge>
          )}
        </div>
      ))}
    </div>
  )
}
