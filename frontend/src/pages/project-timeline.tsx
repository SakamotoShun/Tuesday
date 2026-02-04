import { useMemo, useState } from "react"
import { useProject } from "@/hooks/use-projects"
import { useTasks, useTaskStatuses } from "@/hooks/use-tasks"
import { TimelineView } from "@/components/timeline/timeline-view"
import { TimelineFilters } from "@/components/timeline/timeline-filters"
import { TimelineLegend } from "@/components/timeline/timeline-legend"
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import type { Task, User } from "@/api/types"

interface ProjectTimelinePageProps {
  projectId: string
}

const formatDate = (value: string) => new Date(value).toISOString().slice(0, 10)

export function ProjectTimelinePage({ projectId }: ProjectTimelinePageProps) {
  const { data: project } = useProject(projectId)
  const { tasks, isLoading, updateTask, deleteTask, updateTaskAssignees } = useTasks(projectId)
  const { data: statuses } = useTaskStatuses()

  const [viewMode, setViewMode] = useState<"Day" | "Week" | "Month">("Month")
  const [selectedStatusIds, setSelectedStatusIds] = useState<string[]>([])
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)

  const projectMembers: User[] = project?.members
    ?.map((m) => m.user)
    .filter((user): user is User => user !== undefined) || []

  const statusClassMap = useMemo(() => {
    if (!statuses) return {}
    const map: Record<string, { className: string; color: string }> = {}
    statuses.forEach((status) => {
      const safeId = status.id.replace(/[^a-z0-9]/gi, "")
      map[status.id] = { className: `status-${safeId}`, color: status.color }
    })
    return map
  }, [statuses])

  const statusStyles = useMemo(() => {
    return Object.values(statusClassMap).reduce<Record<string, string>>((acc, entry) => {
      acc[entry.className] = entry.color
      return acc
    }, {})
  }, [statusClassMap])

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (selectedStatusIds.length > 0 && (!task.statusId || !selectedStatusIds.includes(task.statusId))) {
        return false
      }

      if (selectedAssigneeId) {
        const hasAssignee = task.assignees?.some((assignee) => assignee.id === selectedAssigneeId)
        if (!hasAssignee) return false
      }

      return true
    })
  }, [tasks, selectedStatusIds, selectedAssigneeId])

  const timelineTasks = useMemo(() => {
    return filteredTasks
      .filter((task) => task.startDate || task.dueDate)
      .map((task) => {
        const start = task.startDate || task.dueDate
        const end = task.dueDate || task.startDate
        const className = task.statusId ? statusClassMap[task.statusId]?.className : undefined
        return {
          id: task.id,
          name: task.title,
          start: start ? formatDate(start) : formatDate(new Date().toISOString()),
          end: end ? formatDate(end) : formatDate(new Date().toISOString()),
          progress: 0,
          custom_class: className,
        }
      })
  }, [filteredTasks, statusClassMap])

  const handleToggleStatus = (statusId: string) => {
    setSelectedStatusIds((prev) =>
      prev.includes(statusId) ? prev.filter((id) => id !== statusId) : [...prev, statusId]
    )
  }

  const handleTaskClick = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
    setSelectedTask(task)
    setIsTaskDialogOpen(true)
  }

  const handleDateChange = (taskId: string, start: Date, end: Date) => {
    updateTask.mutate({
      taskId,
      data: {
        startDate: start.toISOString().slice(0, 10),
        dueDate: end.toISOString().slice(0, 10),
      },
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    )
  }

  if (!statuses || statuses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        Add task statuses to view the timeline.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TimelineFilters
        statuses={statuses}
        selectedStatusIds={selectedStatusIds}
        onToggleStatus={handleToggleStatus}
        assignees={projectMembers}
        selectedAssigneeId={selectedAssigneeId}
        onAssigneeChange={setSelectedAssigneeId}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {timelineTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          Add start or due dates to tasks to see them on the timeline.
        </div>
      ) : (
        <TimelineView
          tasks={timelineTasks}
          viewMode={viewMode}
          onTaskClick={handleTaskClick}
          onDateChange={handleDateChange}
          statusStyles={statusStyles}
          className="overflow-hidden"
        />
      )}

      <TimelineLegend statuses={statuses} />

      <TaskDetailDialog
        task={selectedTask}
        statuses={statuses}
        members={projectMembers}
        open={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        onSubmit={async (data) => {
          if (!selectedTask) return
          const { assigneeIds, ...taskData } = data
          await updateTask.mutateAsync({ taskId: selectedTask.id, data: taskData })
          if (assigneeIds) {
            await updateTaskAssignees.mutateAsync({ taskId: selectedTask.id, data: { assigneeIds } })
          }
        }}
        onDelete={
          selectedTask
            ? async () => {
                await deleteTask.mutateAsync(selectedTask.id)
                setSelectedTask(null)
                setIsTaskDialogOpen(false)
              }
            : null
        }
        isSubmitting={updateTask.isPending || deleteTask.isPending}
      />
    </div>
  )
}
