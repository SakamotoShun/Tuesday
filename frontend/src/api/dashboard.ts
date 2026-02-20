import { api } from "./client"
import type { ActivityLogItem, DashboardStats } from "./types"

export const dashboardApi = {
  stats: (): Promise<DashboardStats> => {
    return api.get<DashboardStats>("/dashboard/stats")
  },

  activity: (limit = 25): Promise<ActivityLogItem[]> => {
    const params = new URLSearchParams({ limit: String(limit) })
    return api.get<ActivityLogItem[]>(`/dashboard/activity?${params.toString()}`)
  },
}
