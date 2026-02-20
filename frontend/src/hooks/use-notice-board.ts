import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { noticeBoardApi } from "@/api/notice-board"
import type {
  CreateNoticeBoardItemInput,
  NoticeBoardItem,
  UpdateNoticeBoardItemInput,
} from "@/api/types"

const NOTICE_BOARD_QUERY_KEY = ["notice-board"] as const

export function useNoticeBoardItems() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: NOTICE_BOARD_QUERY_KEY,
    queryFn: () => noticeBoardApi.list(),
  })

  const createItem = useMutation({
    mutationFn: (input: CreateNoticeBoardItemInput) => noticeBoardApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTICE_BOARD_QUERY_KEY })
    },
  })

  const updateItem = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNoticeBoardItemInput }) =>
      noticeBoardApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTICE_BOARD_QUERY_KEY })
    },
  })

  const deleteItem = useMutation({
    mutationFn: (id: string) => noticeBoardApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTICE_BOARD_QUERY_KEY })
    },
  })

  const toggleItem = useMutation({
    mutationFn: (id: string) => noticeBoardApi.toggle(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: NOTICE_BOARD_QUERY_KEY })
      const previous = queryClient.getQueryData<NoticeBoardItem[]>(NOTICE_BOARD_QUERY_KEY)

      if (previous) {
        queryClient.setQueryData<NoticeBoardItem[]>(
          NOTICE_BOARD_QUERY_KEY,
          previous.map((item) =>
            item.id === id && item.type === "todo"
              ? {
                  ...item,
                  isCompleted: !item.isCompleted,
                  completedAt: item.isCompleted ? null : new Date().toISOString(),
                }
              : item
          )
        )
      }

      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTICE_BOARD_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTICE_BOARD_QUERY_KEY })
    },
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createItem,
    updateItem,
    deleteItem,
    toggleItem,
  }
}
