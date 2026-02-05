import { api } from "./client"
import type { Team, TeamMember, TeamProject } from "./types"

export interface CreateTeamInput {
  name: string
  description?: string | null
}

export interface UpdateTeamInput {
  name?: string
  description?: string | null
}

export async function list(): Promise<Team[]> {
  return api.get<Team[]>("/teams")
}

export async function get(id: string): Promise<Team> {
  return api.get<Team>(`/teams/${id}`)
}

export async function create(data: CreateTeamInput): Promise<Team> {
  return api.post<Team>("/teams", data)
}

export async function update(id: string, data: UpdateTeamInput): Promise<Team> {
  return api.patch<Team>(`/teams/${id}`, data)
}

export async function remove(id: string): Promise<{ deleted: boolean }> {
  return api.delete<{ deleted: boolean }>(`/teams/${id}`)
}

// Members
export async function getMembers(teamId: string): Promise<TeamMember[]> {
  return api.get<TeamMember[]>(`/teams/${teamId}/members`)
}

export async function addMember(teamId: string, userId: string, role: "lead" | "member"): Promise<TeamMember> {
  return api.post<TeamMember>(`/teams/${teamId}/members`, { userId, role })
}

export async function updateMember(teamId: string, userId: string, role: "lead" | "member"): Promise<TeamMember> {
  return api.patch<TeamMember>(`/teams/${teamId}/members/${userId}`, { role })
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/members/${userId}`)
}

// Projects
export async function getProjects(teamId: string): Promise<TeamProject[]> {
  return api.get<TeamProject[]>(`/teams/${teamId}/projects`)
}

export async function assignProject(teamId: string, projectId: string): Promise<TeamProject> {
  return api.post<TeamProject>(`/teams/${teamId}/projects`, { projectId })
}

export async function unassignProject(teamId: string, projectId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/projects/${projectId}`)
}
