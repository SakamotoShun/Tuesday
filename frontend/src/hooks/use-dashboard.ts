import { useQuery } from "@tanstack/react-query"
import { dashboardApi } from "@/api/dashboard"

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: dashboardApi.stats,
  })
}

export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey: ["dashboard", "activity", limit],
    queryFn: () => dashboardApi.activity(limit),
  })
}
