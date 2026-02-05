import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as teamsApi from "@/api/teams"
import type { CreateTeamInput, UpdateTeamInput } from "@/api/teams"

export function useTeams() {
  const queryClient = useQueryClient()

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: teamsApi.list,
  })

  const createTeam = useMutation({
    mutationFn: (data: CreateTeamInput) => teamsApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  })

  const updateTeam = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTeamInput }) => teamsApi.update(id, data),
    onSuccess: (team) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] })
      queryClient.invalidateQueries({ queryKey: ["teams", team.id] })
    },
  })

  const deleteTeam = useMutation({
    mutationFn: (id: string) => teamsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  })

  return {
    teams: teamsQuery.data ?? [],
    isLoading: teamsQuery.isLoading,
    error: teamsQuery.error,
    createTeam,
    updateTeam,
    deleteTeam,
  }
}

export function useTeam(teamId: string) {
  return useQuery({
    queryKey: ["teams", teamId],
    queryFn: () => teamsApi.get(teamId),
    enabled: !!teamId,
  })
}

export function useTeamMembers(teamId: string) {
  const queryClient = useQueryClient()

  const membersQuery = useQuery({
    queryKey: ["teams", teamId, "members"],
    queryFn: () => teamsApi.getMembers(teamId),
    enabled: !!teamId,
  })

  const addMember = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "lead" | "member" }) =>
      teamsApi.addMember(teamId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
  })

  const updateMemberRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "lead" | "member" }) =>
      teamsApi.updateMember(teamId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) => teamsApi.removeMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
  })

  return {
    members: membersQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    error: membersQuery.error,
    addMember,
    updateMemberRole,
    removeMember,
  }
}

export function useTeamProjects(teamId: string) {
  const queryClient = useQueryClient()

  const projectsQuery = useQuery({
    queryKey: ["teams", teamId, "projects"],
    queryFn: () => teamsApi.getProjects(teamId),
    enabled: !!teamId,
  })

  const assignProject = useMutation({
    mutationFn: (projectId: string) => teamsApi.assignProject(teamId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "projects"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
  })

  const unassignProject = useMutation({
    mutationFn: (projectId: string) => teamsApi.unassignProject(teamId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "projects"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
  })

  return {
    projects: projectsQuery.data ?? [],
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    assignProject,
    unassignProject,
  }
}
