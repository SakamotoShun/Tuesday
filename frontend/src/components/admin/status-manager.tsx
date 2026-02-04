import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAdminStatuses } from "@/hooks/use-admin"
import type { ProjectStatus, TaskStatus } from "@/api/types"

type StatusDraft = { name: string; color: string }

export function StatusManager() {
  const {
    projectStatuses,
    taskStatuses,
    createProjectStatus,
    updateProjectStatus,
    deleteProjectStatus,
    createTaskStatus,
    updateTaskStatus,
    deleteTaskStatus,
  } = useAdminStatuses()

  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectColor, setNewProjectColor] = useState("#6b7280")
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskColor, setNewTaskColor] = useState("#6b7280")

  const projectDrafts = useMemo(
    () =>
      projectStatuses.reduce<Record<string, StatusDraft>>((acc, status) => {
        acc[status.id] = { name: status.name, color: status.color }
        return acc
      }, {}),
    [projectStatuses]
  )

  const taskDrafts = useMemo(
    () =>
      taskStatuses.reduce<Record<string, StatusDraft>>((acc, status) => {
        acc[status.id] = { name: status.name, color: status.color }
        return acc
      }, {}),
    [taskStatuses]
  )

  const [projectEdits, setProjectEdits] = useState<Record<string, StatusDraft>>({})
  const [taskEdits, setTaskEdits] = useState<Record<string, StatusDraft>>({})

  const getProjectDraft = (status: ProjectStatus) => projectEdits[status.id] ?? projectDrafts[status.id]
  const getTaskDraft = (status: TaskStatus) => taskEdits[status.id] ?? taskDrafts[status.id]

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold">Statuses</div>
        <div className="text-sm text-muted-foreground">Customize project and task status lists.</div>
      </div>

      <div className="space-y-4">
        <div className="text-sm font-semibold">Project Statuses</div>
        <div className="space-y-2">
          {projectStatuses.map((status) => {
            const draft = getProjectDraft(status)
            return (
              <div key={status.id} className="flex flex-col md:flex-row gap-2 items-center">
                <Input
                  value={draft?.name ?? status.name}
                  onChange={(event) =>
                    setProjectEdits((prev) => ({
                      ...prev,
                      [status.id]: { name: event.target.value, color: draft?.color ?? status.color },
                    }))
                  }
                  className="flex-1"
                />
                <Input
                  type="color"
                  value={draft?.color ?? status.color}
                  onChange={(event) =>
                    setProjectEdits((prev) => ({
                      ...prev,
                      [status.id]: { name: draft?.name ?? status.name, color: event.target.value },
                    }))
                  }
                  className="w-16 h-10 p-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateProjectStatus.mutate({
                      id: status.id,
                      data: { name: draft?.name ?? status.name, color: draft?.color ?? status.color },
                    })
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteProjectStatus.mutate(status.id)}>
                  Delete
                </Button>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col md:flex-row gap-2 items-center">
          <Input
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            placeholder="New project status"
            className="flex-1"
          />
          <Input
            type="color"
            value={newProjectColor}
            onChange={(event) => setNewProjectColor(event.target.value)}
            className="w-16 h-10 p-1"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newProjectName) return
              createProjectStatus.mutate({ name: newProjectName, color: newProjectColor, sortOrder: projectStatuses.length })
              setNewProjectName("")
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-sm font-semibold">Task Statuses</div>
        <div className="space-y-2">
          {taskStatuses.map((status) => {
            const draft = getTaskDraft(status)
            return (
              <div key={status.id} className="flex flex-col md:flex-row gap-2 items-center">
                <Input
                  value={draft?.name ?? status.name}
                  onChange={(event) =>
                    setTaskEdits((prev) => ({
                      ...prev,
                      [status.id]: { name: event.target.value, color: draft?.color ?? status.color },
                    }))
                  }
                  className="flex-1"
                />
                <Input
                  type="color"
                  value={draft?.color ?? status.color}
                  onChange={(event) =>
                    setTaskEdits((prev) => ({
                      ...prev,
                      [status.id]: { name: draft?.name ?? status.name, color: event.target.value },
                    }))
                  }
                  className="w-16 h-10 p-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateTaskStatus.mutate({
                      id: status.id,
                      data: { name: draft?.name ?? status.name, color: draft?.color ?? status.color },
                    })
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteTaskStatus.mutate(status.id)}>
                  Delete
                </Button>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col md:flex-row gap-2 items-center">
          <Input
            value={newTaskName}
            onChange={(event) => setNewTaskName(event.target.value)}
            placeholder="New task status"
            className="flex-1"
          />
          <Input
            type="color"
            value={newTaskColor}
            onChange={(event) => setNewTaskColor(event.target.value)}
            className="w-16 h-10 p-1"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newTaskName) return
              createTaskStatus.mutate({ name: newTaskName, color: newTaskColor, sortOrder: taskStatuses.length })
              setNewTaskName("")
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
