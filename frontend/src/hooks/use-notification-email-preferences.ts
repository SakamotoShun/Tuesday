import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as profileApi from "@/api/profile"
import type { NotificationEmailPreferences } from "@/api/types"

const queryKey = ["profile", "notification-email-preferences"] as const

export function useNotificationEmailPreferences() {
  const queryClient = useQueryClient()
  const preferencesQuery = useQuery({
    queryKey,
    queryFn: profileApi.getNotificationEmailPreferences,
  })
  const updatePreference = useMutation({
    mutationFn: (update: Partial<NotificationEmailPreferences>) =>
      profileApi.updateNotificationEmailPreferences(update),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  })

  return {
    data: preferencesQuery.data,
    isLoading: preferencesQuery.isLoading,
    error: preferencesQuery.error,
    updatePreference,
  }
}
