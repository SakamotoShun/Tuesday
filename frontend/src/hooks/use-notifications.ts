import { useEffect, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { notificationsApi } from "@/api/notifications"
import type { Notification } from "@/api/types"
import { useWebSocket } from "@/hooks/use-websocket"

export function useNotifications() {
  const queryClient = useQueryClient()
  const { onMessage } = useWebSocket()

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list({ limit: 50 }),
  })

  useEffect(() => {
    return onMessage((event) => {
      if (event.type !== "notification") return
      const notification = event.notification as Notification | undefined
      if (!notification) return

      queryClient.setQueryData<Notification[]>(["notifications"], (current) => {
        const existing = current ?? []
        if (existing.some((item) => item.id === notification.id)) return existing
        return [notification, ...existing]
      })
    })
  }, [onMessage, queryClient])

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: (updated) => {
      queryClient.setQueryData<Notification[]>(["notifications"], (current) => {
        if (!current) return current
        return current.map((item) => (item.id === updated.id ? updated : item))
      })
    },
  })

  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.setQueryData<Notification[]>(["notifications"], (current) => {
        if (!current) return current
        return current.map((item) => ({ ...item, read: true }))
      })
    },
  })

  const unreadCount = useMemo(() => {
    return (notificationsQuery.data ?? []).filter((item) => !item.read).length
  }, [notificationsQuery.data])

  return {
    notifications: notificationsQuery.data ?? [],
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
    unreadCount,
    markRead,
    markAllRead,
  }
}
