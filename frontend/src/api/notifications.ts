import { api } from "./client"
import type { Notification } from "./types"

export const notificationsApi = {
  list: (options?: { unread?: boolean; limit?: number }) => {
    const params = new URLSearchParams()
    if (options?.unread) params.set("unread", "true")
    if (options?.limit) params.set("limit", String(options.limit))
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return api.get<Notification[]>(`/notifications${suffix}`)
  },
  markRead: (id: string) => api.patch<Notification>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<{ updated: number }>("/notifications/read-all", {}),
}
