import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { whiteboardsApi } from "@/api/whiteboards"
import type { CreateWhiteboardInput, UpdateWhiteboardInput } from "@/api/types"

export function useWhiteboards(projectId: string) {
  const queryClient = useQueryClient()

  const whiteboards = useQuery({
    queryKey: ["projects", projectId, "whiteboards"],
    queryFn: () => whiteboardsApi.list(projectId),
    enabled: !!projectId,
  })

  const createWhiteboard = useMutation({
    mutationFn: (data: CreateWhiteboardInput) => whiteboardsApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "whiteboards"],
      })
    },
  })

  const updateWhiteboard = useMutation({
    mutationFn: ({ whiteboardId, data }: { whiteboardId: string; data: UpdateWhiteboardInput }) =>
      whiteboardsApi.update(whiteboardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "whiteboards"],
      })
    },
  })

  const deleteWhiteboard = useMutation({
    mutationFn: (whiteboardId: string) => whiteboardsApi.delete(whiteboardId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "whiteboards"],
      })
    },
  })

  return {
    whiteboards: whiteboards.data ?? [],
    isLoading: whiteboards.isLoading,
    error: whiteboards.error,
    createWhiteboard,
    updateWhiteboard,
    deleteWhiteboard,
  }
}

export function useWhiteboard(whiteboardId: string) {
  return useQuery({
    queryKey: ["whiteboards", whiteboardId],
    queryFn: () => whiteboardsApi.get(whiteboardId),
    enabled: !!whiteboardId,
  })
}
