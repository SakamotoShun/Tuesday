import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as adminApi from "@/api/admin"
import type { AdminCreateUserInput, AdminUpdateUserInput, UpdateAdminSettingsInput, ProjectStatus, TaskStatus } from "@/api/types"

export function useAdminSettings() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: adminApi.getSettings,
  })

  const updateSettings = useMutation({
    mutationFn: (data: UpdateAdminSettingsInput) => adminApi.updateSettings(data),
    onSuccess: (data) => queryClient.setQueryData(["admin", "settings"], data),
  })

  return { settings: settingsQuery.data, isLoading: settingsQuery.isLoading, error: settingsQuery.error, updateSettings }
}

export function useAdminUsers() {
  const queryClient = useQueryClient()
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: adminApi.listUsers,
  })

  const createUser = useMutation({
    mutationFn: (data: AdminCreateUserInput) => adminApi.createUser(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  })

  const updateUser = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: AdminUpdateUserInput }) =>
      adminApi.updateUser(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  })

  return {
    users: usersQuery.data ?? [],
    isLoading: usersQuery.isLoading,
    error: usersQuery.error,
    createUser,
    updateUser,
  }
}

export function useAdminStatuses() {
  const queryClient = useQueryClient()

  const projectStatusesQuery = useQuery({
    queryKey: ["admin", "statuses", "project"],
    queryFn: adminApi.listProjectStatuses,
  })

  const taskStatusesQuery = useQuery({
    queryKey: ["admin", "statuses", "task"],
    queryFn: adminApi.listTaskStatuses,
  })

  const createProjectStatus = useMutation({
    mutationFn: (data: Pick<ProjectStatus, "name" | "color" | "sortOrder">) => adminApi.createProjectStatus(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "project"] }),
  })

  const updateProjectStatus = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<ProjectStatus, "name" | "color" | "sortOrder">> }) =>
      adminApi.updateProjectStatus(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "project"] }),
  })

  const deleteProjectStatus = useMutation({
    mutationFn: (id: string) => adminApi.deleteProjectStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "project"] }),
  })

  const createTaskStatus = useMutation({
    mutationFn: (data: Pick<TaskStatus, "name" | "color" | "sortOrder">) => adminApi.createTaskStatus(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "task"] }),
  })

  const updateTaskStatus = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<TaskStatus, "name" | "color" | "sortOrder">> }) =>
      adminApi.updateTaskStatus(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "task"] }),
  })

  const deleteTaskStatus = useMutation({
    mutationFn: (id: string) => adminApi.deleteTaskStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "task"] }),
  })

  return {
    projectStatuses: projectStatusesQuery.data ?? [],
    taskStatuses: taskStatusesQuery.data ?? [],
    createProjectStatus,
    updateProjectStatus,
    deleteProjectStatus,
    createTaskStatus,
    updateTaskStatus,
    deleteTaskStatus,
  }
}
