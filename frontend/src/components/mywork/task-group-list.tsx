import type { Task } from "@/api/types"
import { TaskListItem } from "@/components/mywork/task-list-item"
import { isCompletedStatus } from "@/lib/task-status"

type TaskSortMode = "urgency" | "dueDate" | "updated" | "alphabetical"

interface TaskGroupListProps {
  tasks: Task[]
  groupBy: "project" | "status"
  sortBy?: TaskSortMode
  onSelect?: (task: Task) => void
}

function parseDueDate(value: string | null): Date | null {
  if (!value) return null
  return new Date(`${value}T00:00:00`)
}

function getTaskSortDate(task: Task): number {
  const dueDate = parseDueDate(task.dueDate)
  return dueDate ? dueDate.getTime() : Number.MAX_SAFE_INTEGER
}

function sortTasks(tasks: Task[], sortBy: TaskSortMode): Task[] {
  const sorted = [...tasks]

  sorted.sort((a, b) => {
    if (sortBy === "alphabetical") {
      return a.title.localeCompare(b.title)
    }

    if (sortBy === "updated") {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }

    if (sortBy === "dueDate") {
      return getTaskSortDate(a) - getTaskSortDate(b)
    }

    const aCompleted = isCompletedStatus(a.status?.name)
    const bCompleted = isCompletedStatus(b.status?.name)

    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1
    }

    const urgencyDiff = getTaskSortDate(a) - getTaskSortDate(b)
    if (urgencyDiff !== 0) {
      return urgencyDiff
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return sorted
}

function sortGroups(entries: Array<[string, Task[]]>): Array<[string, Task[]]> {
  return entries.sort((a, b) => {
    const aKey = a[0].toLowerCase() === "no project" || a[0].toLowerCase() === "no status"
    const bKey = b[0].toLowerCase() === "no project" || b[0].toLowerCase() === "no status"

    if (aKey !== bKey) {
      return aKey ? 1 : -1
    }

    return a[0].localeCompare(b[0])
  })
}

export function TaskGroupList({ tasks, groupBy, sortBy = "urgency", onSelect }: TaskGroupListProps) {
  if (tasks.length === 0) {
    return <div className="text-sm text-muted-foreground">No tasks assigned.</div>
  }

  const grouped = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = groupBy === "project" ? task.project?.name ?? "No Project" : task.status?.name ?? "No Status"
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})

  const groups = sortGroups(Object.entries(grouped)).map(([group, groupTasks]) => [
    group,
    sortTasks(groupTasks, sortBy),
  ] as const)

  return (
    <div className="space-y-5">
      {groups.map(([group, groupTasks]) => (
        <section key={group} className="rounded-xl border border-border bg-background/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group}
            </h3>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
              {groupTasks.length}
            </span>
          </div>

          <div className="space-y-2">
            {groupTasks.map((task) => (
              <TaskListItem key={task.id} task={task} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
