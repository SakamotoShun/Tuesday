import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { chatApi } from "@/api/chat"

export function useChannelMembers(channelId?: string | null) {
  const queryClient = useQueryClient()

  const membersQuery = useQuery({
    queryKey: ["channels", channelId, "members"],
    queryFn: () => (channelId ? chatApi.listChannelMembers(channelId) : Promise.resolve([])),
    enabled: Boolean(channelId),
  })

  const addMembers = useMutation({
    mutationFn: (userIds: string[]) =>
      channelId ? chatApi.addChannelMembers(channelId, { userIds }) : Promise.reject(new Error("No channel")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels", channelId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["channels"] })
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      channelId ? chatApi.removeChannelMember(channelId, userId) : Promise.reject(new Error("No channel")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels", channelId, "members"] })
      queryClient.invalidateQueries({ queryKey: ["channels"] })
    },
  })

  return {
    members: membersQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    error: membersQuery.error,
    addMembers,
    removeMember,
  }
}
