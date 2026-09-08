import { useEffect } from "react"
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { notificationsApi } from "@/api/notifications"
import type { Notification, NotificationPage } from "@/api/types"
import { useWebSocket } from "@/hooks/use-websocket"

export function useNotifications() {
  const queryClient = useQueryClient()
  const { onMessage } = useWebSocket()

  const notificationsQuery = useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: ({ pageParam }) => notificationsApi.list({ limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  useEffect(() => {
    return onMessage(async (event) => {
      if (event.type !== "notification") return
      const notification = event.notification as Notification | undefined
      if (!notification) return

      // A page fetched before this event must not overwrite the new notification.
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      queryClient.setQueryData<InfiniteData<NotificationPage, string | undefined>>(["notifications"], (current) => {
        if (!current) return current
        if (current.pages.some((page) => page.items.some((item) => item.id === notification.id))) return current
        const [firstPage, ...remainingPages] = current.pages
        if (!firstPage) return current
        return {
          ...current,
          pages: [{
            ...firstPage,
            items: [notification, ...firstPage.items],
            unreadCount: firstPage.unreadCount + (notification.read ? 0 : 1),
          }, ...remainingPages],
        }
      })
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    })
  }, [onMessage, queryClient])

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: (updated) => {
      queryClient.setQueryData<InfiniteData<NotificationPage, string | undefined>>(["notifications"], (current) => {
        if (!current) return current
        const wasUnread = current.pages.some((page) => page.items.some((item) => item.id === updated.id && !item.read))
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            unreadCount: Math.max(0, page.unreadCount - (wasUnread ? 1 : 0)),
            items: page.items.map((item) => (item.id === updated.id ? updated : item)),
          })),
        }
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    // New notifications may arrive after the server update but before its response.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const seen = new Set<string>()
  const notifications = (notificationsQuery.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
  const unreadCount = notificationsQuery.data?.pages[0]?.unreadCount ?? 0

  return {
    notifications,
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
    unreadCount,
    markRead,
    markAllRead,
    hasNextPage: notificationsQuery.hasNextPage,
    fetchNextPage: notificationsQuery.fetchNextPage,
    isFetchingNextPage: notificationsQuery.isFetchingNextPage,
    refetch: notificationsQuery.refetch,
  }
}
