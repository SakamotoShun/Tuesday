import type { Task } from "@/api/types"
import { TaskListItem } from "@/components/mywork/task-list-item"

interface TaskGroupListProps {
  tasks: Task[]
  groupBy: "project" | "status"
  onSelect?: (task: Task) => void
}

export function TaskGroupList({ tasks, groupBy, onSelect }: TaskGroupListProps) {
  if (tasks.length === 0) {
    return <div className="text-sm text-muted-foreground">No tasks assigned.</div>
  }

  const grouped = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = groupBy === "project" ? task.project?.name ?? "No Project" : task.status?.name ?? "No Status"
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([group, groupTasks]) => (
        <div key={group}>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{group}</div>
          <div className="space-y-2">
            {groupTasks.map((task) => (
              <TaskListItem key={task.id} task={task} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
