import { useState } from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, MoreHorizontal, Pencil, Trash2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/common/error-boundary"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useProject, useProjects, useProjectStatuses } from "@/hooks/use-projects"
import { useTasks, useTaskStatuses } from "@/hooks/use-tasks"
import { StatusBadge } from "@/components/projects/status-badge"
import { EditProjectDialog } from "@/components/projects/edit-project-dialog"
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog"
import { ManageMembersDialog } from "@/components/projects/manage-members-dialog"
import { KanbanBoard } from "@/components/tasks/kanban-board"
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog"
import { ProjectDocsPage } from "@/pages/project-docs"
import { ProjectSchedulePage } from "@/pages/project-schedule"
import { ProjectWhiteboardsPage } from "@/pages/project-whiteboards"
import { ChatView } from "@/components/chat/chat-view"
import { ProjectTimeReport } from "@/components/timesheet"
import type { Task, UpdateProjectInput, UpdateTaskInput, User } from "@/api/types"
import { useAuth } from "@/hooks/use-auth"

const PROJECT_TABS = new Set(["docs", "tasks", "schedule", "whiteboards", "chat", "time"])

export function ProjectDetailPage() {
  const { id, "*": tabPath } = useParams<{ id: string; "*"?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const tabFromPath = tabPath?.split("/")[0]
  const defaultTab = tabFromPath && PROJECT_TABS.has(tabFromPath) ? tabFromPath : "docs"
  const { data: project, isLoading: isProjectLoading } = useProject(id || "")
  const { tasks, isLoading: isTasksLoading, createTask, updateTaskStatus, updateTaskOrder, updateTask, deleteTask, updateTaskAssignees } = useTasks(id || "")
  const { data: taskStatuses, isLoading: isTaskStatusesLoading } = useTaskStatuses()
  const { data: projectStatuses, isLoading: isProjectStatusesLoading } = useProjectStatuses()
  const { updateProject, deleteProject } = useProjects()
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)

  const isLoading = isProjectLoading || isTasksLoading || isTaskStatusesLoading || isProjectStatusesLoading

  const handleTaskMove = (taskId: string, statusId: string) => {
    updateTaskStatus.mutate({ taskId, data: { statusId } })
  }

  const handleTaskReorder = (taskId: string, sortOrder: number) => {
    updateTaskOrder.mutate({ taskId, data: { sortOrder } })
  }

  const handleAddTask = (title: string, statusId: string) => {
    createTask.mutate({ title, statusId })
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setIsTaskDialogOpen(true)
  }

  const handleUpdateTask = async (taskId: string, data: UpdateTaskInput) => {
    const { assigneeIds, ...taskData } = data
    await updateTask.mutateAsync({ taskId, data: taskData })
    if (assigneeIds) {
      await updateTaskAssignees.mutateAsync({ taskId, data: { assigneeIds } })
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask.mutateAsync(taskId)
    setSelectedTask(null)
    setIsTaskDialogOpen(false)
  }

  const handleEditProject = async (data: UpdateProjectInput) => {
    if (!project) return
    await updateProject.mutateAsync({ id: project.id, data })
  }

  const handleDeleteProject = async () => {
    if (!project) return
    await deleteProject.mutateAsync(project.id)
    navigate("/projects")
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
        <Button onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Button>
      </div>
    )
  }

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "—"
    const startStr = start
      ? new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "TBD"
    const endStr = end
      ? new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Ongoing"
    return `${startStr} → ${endStr}`
  }

  const currentMemberRole = project.members
    ?.find((member) => member.userId === user?.id)
    ?.role
  const canManageMembers = user?.role === "admin" || currentMemberRole === "owner"
  const budgetHours = parseHours(project.budgetHours)
  const loggedHours = Math.max(project.totalLoggedHours ?? 0, 0)
  const hasBudget = canManageMembers && budgetHours !== null && budgetHours > 0
  const usedPercent = hasBudget ? (loggedHours / budgetHours) * 100 : 0
  const clampedPercent = Math.min(Math.max(usedPercent, 0), 100)
  const isOverBudget = hasBudget && usedPercent > 100
  const isNearBudget = hasBudget && usedPercent > 75 && usedPercent <= 100

  // Extract project members as User objects for assignee picker
  const projectMembers: User[] = project.members
    ?.map((m) => m.user)
    .filter((user): user is User => user !== undefined) || []

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/projects" className="hover:text-foreground">
          Projects
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{project.name}</span>
      </div>

      {/* Project Header Card */}
      <Card className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="font-serif text-[28px] font-bold mb-2">
              {project.name}
            </h1>
            <p className="text-muted-foreground">
              {project.client || "Internal Project"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={project.status?.name} />
            <Button variant="outline" onClick={() => setIsMembersDialogOpen(true)}>
              Manage Members
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex gap-8">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Owners
            </div>
            <div className="flex -space-x-2">
              {project.members
                ?.filter((m) => m.role === "owner")
                .map((member) => (
                  <Avatar
                    key={member.userId}
                    className="h-8 w-8 border-2 border-card"
                  >
                    <AvatarImage
                      src={member.user?.avatarUrl ?? undefined}
                      alt={member.user?.name ?? "User"}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {getInitials(member.user?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Timeline
            </div>
            <div className="font-semibold text-sm">
              {formatDateRange(project.startDate, project.targetEndDate)}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Type
            </div>
            <div className="font-semibold text-sm">
              {project.type || "Not specified"}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Members
            </div>
            <div className="font-semibold text-sm">
              {project.members?.length || 0} people
            </div>
          </div>
        </div>

        {canManageMembers && (
          <div className="mt-6 rounded-lg border border-border/70 bg-card/70 px-4 py-3">
            {hasBudget && budgetHours !== null ? (
              <>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-medium ${
                      isOverBudget
                        ? "text-destructive"
                        : isNearBudget
                          ? "text-amber-600"
                          : "text-foreground"
                    }`}
                  >
                    {isOverBudget ? "Over budget" : "Hour budget"}
                  </span>
                  <span
                    className={`font-medium ${
                      isOverBudget
                        ? "text-destructive"
                        : isNearBudget
                          ? "text-amber-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {formatHours(loggedHours)}h / {formatHours(budgetHours)}h
                    {isOverBudget && ` (+${formatHours(loggedHours - budgetHours)}h)`}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOverBudget
                        ? "bg-destructive"
                        : isNearBudget
                          ? "bg-amber-500"
                          : "bg-primary"
                    }`}
                    style={{ width: `${clampedPercent}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No allocated hours yet. Edit project to set a budget.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="flex flex-col flex-1 min-h-0">
        <TabsList>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="whiteboards">Whiteboards</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          {canManageMembers && <TabsTrigger value="time">Time</TabsTrigger>}
        </TabsList>

        <TabsContent value="docs" className="mt-6">
          <ErrorBoundary title="Docs unavailable" message="The docs section crashed. Try reloading this section." resetKeys={[project.id, "docs"]}>
            <ProjectDocsPage projectId={project.id} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <ErrorBoundary title="Tasks unavailable" message="The kanban board crashed. Try reloading this section." resetKeys={[project.id, "tasks"]}>
            {taskStatuses && (
              <div className="h-[calc(100vh-400px)] min-h-[500px]">
                <KanbanBoard
                  tasks={tasks}
                  statuses={taskStatuses}
                  onTaskMove={handleTaskMove}
                  onTaskReorder={handleTaskReorder}
                  onAddTask={handleAddTask}
                  onTaskClick={handleTaskClick}
                  isLoading={createTask.isPending || updateTaskStatus.isPending}
                />
              </div>
            )}
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="schedule" className="mt-6">
          <ErrorBoundary title="Schedule unavailable" message="The schedule section crashed. Try reloading this section." resetKeys={[project.id, "schedule"]}>
            <ProjectSchedulePage projectId={project.id} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="whiteboards" className="mt-6">
          <ErrorBoundary title="Whiteboards unavailable" message="The whiteboards section crashed. Try reloading this section." resetKeys={[project.id, "whiteboards"]}>
            <ProjectWhiteboardsPage projectId={project.id} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="chat" className="mt-6 flex flex-col flex-1 min-h-0">
          <ErrorBoundary title="Chat unavailable" message="The project chat crashed. Try reloading this section." resetKeys={[project.id, "chat"]}>
            <div className="flex flex-1 min-h-0">
              <ChatView projectId={project.id} title="Project Chat" />
            </div>
          </ErrorBoundary>
        </TabsContent>

        {canManageMembers && (
          <TabsContent value="time" className="mt-6">
            <ErrorBoundary title="Time reports unavailable" message="The time report crashed. Try reloading this section." resetKeys={[project.id, "time"]}>
              <div className="border rounded-lg p-4">
                <ProjectTimeReport projectId={project.id} />
              </div>
            </ErrorBoundary>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Project Dialog */}
      <EditProjectDialog
        project={project}
        statuses={projectStatuses || []}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSubmit={handleEditProject}
      />

      {/* Delete Project Dialog */}
      <DeleteProjectDialog
        project={project}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteProject}
      />

      {/* Manage Members Dialog */}
      <ManageMembersDialog
        projectId={project.id}
        projectName={project.name}
        open={isMembersDialogOpen}
        onOpenChange={setIsMembersDialogOpen}
        canManage={canManageMembers}
        currentUserId={user?.id}
      />

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        task={selectedTask}
        statuses={taskStatuses || []}
        members={projectMembers}
        open={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        onSubmit={async (data) => {
          if (selectedTask) {
            await handleUpdateTask(selectedTask.id, data)
          }
        }}
        onDelete={selectedTask ? () => handleDeleteTask(selectedTask.id) : null}
        isSubmitting={updateTask.isPending || deleteTask.isPending}
      />
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function parseHours(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
