import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as setupApi from "@/api/setup"
import type { SetupInput } from "@/api/types"

export function useSetup() {
  const queryClient = useQueryClient()

  const status = useQuery({
    queryKey: ["setup", "status"],
    queryFn: setupApi.getStatus,
  })

  const complete = useMutation({
    mutationFn: (data: SetupInput) => setupApi.complete(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setup"] })
    },
  })

  return {
    isInitialized: status.data?.initialized ?? false,
    isLoading: status.isLoading,
    complete,
  }
}
