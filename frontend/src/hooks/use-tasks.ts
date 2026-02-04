import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { tasksApi } from "@/api/tasks"
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  UpdateTaskStatusInput,
  UpdateTaskOrderInput,
  UpdateTaskAssigneesInput,
} from "@/api/types"

export function useTasks(projectId: string) {
  const queryClient = useQueryClient()

  const tasks = useQuery({
    queryKey: ["projects", projectId, "tasks"],
    queryFn: () => tasksApi.list(projectId),
    enabled: !!projectId,
  })

  const createTask = useMutation({
    mutationFn: (data: CreateTaskInput) => tasksApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      })
    },
  })

  const updateTask = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: UpdateTaskInput }) =>
      tasksApi.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      })
    },
  })

  const updateTaskStatus = useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string
      data: UpdateTaskStatusInput
    }) => tasksApi.updateStatus(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      })
    },
  })

  const updateTaskOrder = useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string
      data: UpdateTaskOrderInput
    }) => tasksApi.updateOrder(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      })
    },
  })

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      })
    },
  })

  const updateTaskAssignees = useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string
      data: UpdateTaskAssigneesInput
    }) => tasksApi.updateAssignees(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      })
    },
  })

  return {
    tasks: tasks.data ?? [],
    isLoading: tasks.isLoading,
    error: tasks.error,
    createTask,
    updateTask,
    updateTaskStatus,
    updateTaskOrder,
    deleteTask,
    updateTaskAssignees,
  }
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => tasksApi.get(taskId),
    enabled: !!taskId,
  })
}

export function useTaskStatuses() {
  return useQuery({
    queryKey: ["task-statuses"],
    queryFn: () => tasksApi.listStatuses(),
  })
}

export function useMyTasks() {
  return useQuery({
    queryKey: ["tasks", "my"],
    queryFn: () => tasksApi.myTasks(),
  })
}
