import { api } from "./client"
import type { Notification, NotificationPage } from "./types"

export const notificationsApi = {
  list: (options?: { unread?: boolean; limit?: number; cursor?: string }) => {
    const params = new URLSearchParams()
    if (options?.unread) params.set("unread", "true")
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.cursor) params.set("cursor", options.cursor)
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return api.get<NotificationPage>(`/notifications${suffix}`)
  },
  markRead: (id: string) => api.patch<Notification>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<{ updated: number }>("/notifications/read-all", {}),
}
