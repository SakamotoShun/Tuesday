import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth-store"
import * as profileApi from "@/api/profile"
import type { User } from "@/api/types"

export function useProfile() {
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()

  const syncUser = (updated: User) => {
    setUser(updated)
    queryClient.setQueryData(["auth", "me"], updated)
  }

  const updateProfile = useMutation({
    mutationFn: (data: profileApi.UpdateProfileInput) => profileApi.updateProfile(data),
    onSuccess: (updated) => syncUser(updated),
  })

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
    onSuccess: (updated) => syncUser(updated),
  })

  const removeAvatar = useMutation({
    mutationFn: () => profileApi.removeAvatar(),
    onSuccess: (updated) => syncUser(updated),
  })

  const changePassword = useMutation({
    mutationFn: (data: profileApi.ChangePasswordInput) => profileApi.changePassword(data),
  })

  return {
    user,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    changePassword,
  }
}
