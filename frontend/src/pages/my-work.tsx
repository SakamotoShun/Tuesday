import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMyTasks, useTaskStatuses } from "@/hooks/use-tasks"
import { useProjects } from "@/hooks/use-projects"
import { TaskFilters } from "@/components/mywork/task-filters"
import { TaskGroupList } from "@/components/mywork/task-group-list"
import { EmptyState } from "@/components/common/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function MyWorkPage() {
  const navigate = useNavigate()
  const { data: statuses } = useTaskStatuses()
  const { projects } = useProjects()
  const { data: tasks, isLoading } = useMyTasks()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<"project" | "status">("project")

  const filteredTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter((task) => {
      if (selectedProjectId && task.projectId !== selectedProjectId) return false
      if (selectedStatusId && task.statusId !== selectedStatusId) return false
      return true
    })
  }, [tasks, selectedProjectId, selectedStatusId])

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] font-bold">My Work</h1>
          <p className="text-muted-foreground">All tasks assigned to you across projects.</p>
        </div>
        <Select value={groupBy} onValueChange={(value) => setGroupBy(value as "project" | "status")}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">Group by project</SelectItem>
            <SelectItem value="status">Group by status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TaskFilters
        projects={projects}
        statuses={statuses ?? []}
        selectedProjectId={selectedProjectId}
        selectedStatusId={selectedStatusId}
        onProjectChange={setSelectedProjectId}
        onStatusChange={setSelectedStatusId}
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="No tasks assigned"
          description="Once tasks are assigned to you, they will show up here."
        />
      ) : (
        <TaskGroupList
          tasks={filteredTasks}
          groupBy={groupBy}
          onSelect={(task) => navigate(`/projects/${task.projectId}/tasks`)}
        />
      )}
    </div>
  )
}
