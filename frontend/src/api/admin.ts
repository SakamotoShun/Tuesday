import { api } from "./client"
import type {
  AdminSettings,
  UpdateAdminSettingsInput,
  AdminCreateUserInput,
  AdminUpdateUserInput,
  AdminCreateUserResponse,
  User,
  ProjectStatus,
  TaskStatus,
} from "./types"

export async function getSettings(): Promise<AdminSettings> {
  return api.get<AdminSettings>("/admin/settings")
}

export async function updateSettings(data: UpdateAdminSettingsInput): Promise<AdminSettings> {
  return api.patch<AdminSettings>("/admin/settings", data)
}

export async function listUsers(): Promise<User[]> {
  return api.get<User[]>("/admin/users")
}

export async function createUser(data: AdminCreateUserInput): Promise<AdminCreateUserResponse> {
  return api.post<AdminCreateUserResponse>("/admin/users", data)
}

export async function updateUser(userId: string, data: AdminUpdateUserInput): Promise<User> {
  return api.patch<User>(`/admin/users/${userId}`, data)
}

export async function listProjectStatuses(): Promise<ProjectStatus[]> {
  return api.get<ProjectStatus[]>("/admin/statuses/project")
}

export async function createProjectStatus(data: Pick<ProjectStatus, "name" | "color" | "sortOrder">): Promise<ProjectStatus> {
  return api.post<ProjectStatus>("/admin/statuses/project", data)
}

export async function updateProjectStatus(id: string, data: Partial<Pick<ProjectStatus, "name" | "color" | "sortOrder">>): Promise<ProjectStatus> {
  return api.patch<ProjectStatus>(`/admin/statuses/project/${id}`, data)
}

export async function deleteProjectStatus(id: string): Promise<{ deleted: boolean }> {
  return api.delete<{ deleted: boolean }>(`/admin/statuses/project/${id}`)
}

export async function reorderProjectStatuses(ids: string[]): Promise<{ reordered: boolean }> {
  return api.post<{ reordered: boolean }>("/admin/statuses/project/reorder", { ids })
}

export async function listTaskStatuses(): Promise<TaskStatus[]> {
  return api.get<TaskStatus[]>("/admin/statuses/task")
}

export async function createTaskStatus(data: Pick<TaskStatus, "name" | "color" | "sortOrder">): Promise<TaskStatus> {
  return api.post<TaskStatus>("/admin/statuses/task", data)
}

export async function updateTaskStatus(id: string, data: Partial<Pick<TaskStatus, "name" | "color" | "sortOrder">>): Promise<TaskStatus> {
  return api.patch<TaskStatus>(`/admin/statuses/task/${id}`, data)
}

export async function deleteTaskStatus(id: string): Promise<{ deleted: boolean }> {
  return api.delete<{ deleted: boolean }>(`/admin/statuses/task/${id}`)
}

export async function reorderTaskStatuses(ids: string[]): Promise<{ reordered: boolean }> {
  return api.post<{ reordered: boolean }>("/admin/statuses/task/reorder", { ids })
}
