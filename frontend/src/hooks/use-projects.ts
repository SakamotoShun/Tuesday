import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as projectsApi from "@/api/projects"
import * as teamsApi from "@/api/teams"
import type { CreateProjectInput, UpdateProjectInput } from "@/api/types"

export function useProjectStatuses() {
  return useQuery({
    queryKey: ["project-statuses"],
    queryFn: projectsApi.listStatuses,
  })
}

export function useProjectTemplates() {
  return useQuery({
    queryKey: ["project-templates"],
    queryFn: projectsApi.listTemplates,
  })
}

export function useProjects() {
  const queryClient = useQueryClient()

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  })

  const createProject = useMutation({
    mutationFn: (data: CreateProjectInput) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const updateProject = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectInput }) =>
      projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const deleteProject = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  return {
    projects: projects.data ?? [],
    isLoading: projects.isLoading,
    error: projects.error,
    createProject,
    updateProject,
    deleteProject,
  }
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  })
}

export function useProjectTeams(projectId: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()

  const teamsQuery = useQuery({
    queryKey: ["projects", projectId, "teams"],
    queryFn: () => projectsApi.getTeams(projectId),
    enabled: options?.enabled ?? !!projectId,
  })

  const assignTeam = useMutation({
    mutationFn: (teamId: string) => teamsApi.assignProject(teamId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "teams"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
  })

  const unassignTeam = useMutation({
    mutationFn: (teamId: string) => teamsApi.unassignProject(teamId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "teams"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
  })

  return {
    teams: teamsQuery.data ?? [],
    isLoading: teamsQuery.isLoading,
    error: teamsQuery.error,
    assignTeam,
    unassignTeam,
  }
}
