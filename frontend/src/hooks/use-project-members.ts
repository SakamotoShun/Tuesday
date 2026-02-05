import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as projectsApi from "@/api/projects"
import { usersApi } from "@/api/users"

export function useProjectMembers(projectId: string) {
  const queryClient = useQueryClient()

  const membersQuery = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => projectsApi.getMembers(projectId),
    enabled: !!projectId,
  })

  const addMember = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "owner" | "member" }) =>
      projectsApi.addMember(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] })
    },
  })

  const updateMemberRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "owner" | "member" }) =>
      projectsApi.updateMember(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] })
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) => projectsApi.removeMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] })
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

export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ["users", "mentionable"],
    queryFn: usersApi.listMentionable,
  })
}
