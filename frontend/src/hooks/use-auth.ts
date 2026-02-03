import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth-store"
import * as authApi from "@/api/auth"
import type { LoginInput, RegisterInput } from "@/api/types"

export function useAuth() {
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()

  const { isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const data = await authApi.getCurrentUser()
        setUser(data)
        return data
      } catch {
        setUser(null)
        return null
      }
    },
    retry: false,
    staleTime: Infinity,
  })

  const login = useMutation({
    mutationFn: (data: LoginInput) => authApi.login(data),
    onSuccess: (data) => {
      setUser(data)
      queryClient.invalidateQueries({ queryKey: ["auth"] })
    },
  })

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      setUser(null)
      queryClient.clear()
    },
  })

  const register = useMutation({
    mutationFn: (data: RegisterInput) => authApi.register(data),
  })

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    register,
  }
}
