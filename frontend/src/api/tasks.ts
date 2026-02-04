import { api } from "./client"
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  UpdateTaskStatusInput,
  UpdateTaskOrderInput,
  UpdateTaskAssigneesInput,
  TaskStatus,
  User,
} from "./types"

type BackendAssignee = { userId: string; user: User } | User

const normalizeTask = (
  task: Task & { descriptionMd?: string; assignees?: BackendAssignee[] }
): Task => {
  const assignees = task.assignees
    ? (task.assignees.map((assignee) =>
        "user" in assignee ? assignee.user : assignee
      ) as User[])
    : undefined

  return {
    ...task,
    description: task.description ?? task.descriptionMd ?? null,
    assignees,
  }
}

const normalizeTasks = (tasks: Array<Task & { descriptionMd?: string; assignees?: BackendAssignee[] }>) =>
  tasks.map(normalizeTask)

const mapDescription = (description?: string | null) =>
  description === undefined ? undefined : description ?? ""

export const tasksApi = {
  // Get all tasks for a project
  list: async (projectId: string): Promise<Task[]> => {
    const tasks = await api.get<Task[]>(`/projects/${projectId}/tasks`)
    return normalizeTasks(tasks)
  },

  // Get task statuses
  listStatuses: (): Promise<TaskStatus[]> => {
    return api.get<TaskStatus[]>("/statuses/task")
  },

  // Get single task
  get: async (taskId: string): Promise<Task> => {
    const task = await api.get<Task>(`/tasks/${taskId}`)
    return normalizeTask(task)
  },

  // Create task in project
  create: async (projectId: string, input: CreateTaskInput): Promise<Task> => {
    const { description, ...rest } = input
    const task = await api.post<Task>(`/projects/${projectId}/tasks`, {
      ...rest,
      ...(description !== undefined ? { descriptionMd: mapDescription(description) } : {}),
    })
    return normalizeTask(task)
  },

  // Update task
  update: async (taskId: string, input: UpdateTaskInput): Promise<Task> => {
    const { description, ...rest } = input
    const task = await api.patch<Task>(`/tasks/${taskId}`, {
      ...rest,
      ...(description !== undefined ? { descriptionMd: mapDescription(description) } : {}),
    })
    return normalizeTask(task)
  },

  // Update task status (for kanban drag)
  updateStatus: async (
    taskId: string,
    input: UpdateTaskStatusInput
  ): Promise<Task> => {
    const task = await api.patch<Task>(`/tasks/${taskId}/status`, input)
    return normalizeTask(task)
  },

  // Update task order (for kanban reorder)
  updateOrder: async (taskId: string, input: UpdateTaskOrderInput): Promise<Task> => {
    const task = await api.patch<Task>(`/tasks/${taskId}/order`, input)
    return normalizeTask(task)
  },

  // Delete task
  delete: (taskId: string): Promise<void> => {
    return api.delete<void>(`/tasks/${taskId}`)
  },

  // Get current user's tasks across all projects
  myTasks: async (): Promise<Task[]> => {
    const tasks = await api.get<Task[]>("/tasks/my")
    return normalizeTasks(tasks)
  },

  // Update task assignees
  updateAssignees: async (
    taskId: string,
    input: UpdateTaskAssigneesInput
  ): Promise<Task> => {
    const task = await api.patch<Task>(`/tasks/${taskId}/assignees`, input)
    return normalizeTask(task)
  },
}
