import { api } from "./client"
import type { Project, ProjectMember, CreateProjectInput, UpdateProjectInput } from "./types"

export async function list(): Promise<Project[]> {
  return api.get<Project[]>("/projects")
}

export async function get(id: string): Promise<Project> {
  return api.get<Project>(`/projects/${id}`)
}

export async function create(data: CreateProjectInput): Promise<Project> {
  return api.post<Project>("/projects", data)
}

export async function update(id: string, data: UpdateProjectInput): Promise<Project> {
  return api.patch<Project>(`/projects/${id}`, data)
}

export async function remove(id: string): Promise<void> {
  await api.delete(`/projects/${id}`)
}

// Members
export async function getMembers(id: string): Promise<ProjectMember[]> {
  return api.get<ProjectMember[]>(`/projects/${id}/members`)
}

export async function addMember(
  projectId: string,
  userId: string,
  role: "owner" | "member"
): Promise<ProjectMember> {
  return api.post<ProjectMember>(`/projects/${projectId}/members`, { userId, role })
}

export async function updateMember(
  projectId: string,
  userId: string,
  role: "owner" | "member"
): Promise<ProjectMember> {
  return api.patch<ProjectMember>(`/projects/${projectId}/members/${userId}`, { role })
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/members/${userId}`)
}
