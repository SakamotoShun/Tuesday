import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { timeEntriesApi } from "@/api/time-entries"
import type { UpsertTimeEntryInput } from "@/api/types"

export function useMyTimesheet(week: string) {
  return useQuery({
    queryKey: ["time-entries", "my", week],
    queryFn: () => timeEntriesApi.getMyWeeklyTimesheet(week),
    enabled: !!week,
  })
}

export function useMyMonthlyOverview(month: string) {
  return useQuery({
    queryKey: ["time-entries", "my", "overview", month],
    queryFn: () => timeEntriesApi.getMyMonthlyOverview(month),
    enabled: !!month,
  })
}

export function useUpsertTimeEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpsertTimeEntryInput) => timeEntriesApi.upsert(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["time-entries", "my"],
      })
    },
  })
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entryId: string) => timeEntriesApi.delete(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["time-entries", "my"],
      })
    },
  })
}

export function useExportTimeEntries() {
  return useMutation({
    mutationFn: ({ start, end }: { start: string; end: string }) =>
      timeEntriesApi.exportCsv(start, end),
  })
}

export function useProjectTimesheet(projectId: string, week: string) {
  return useQuery({
    queryKey: ["projects", projectId, "time-entries", week],
    queryFn: () => timeEntriesApi.getProjectWeeklyTimesheet(projectId, week),
    enabled: !!projectId && !!week,
  })
}

export function useProjectMonthlyOverview(projectId: string, month: string) {
  return useQuery({
    queryKey: ["projects", projectId, "time-entries", "overview", month],
    queryFn: () => timeEntriesApi.getProjectMonthlyOverview(projectId, month),
    enabled: !!projectId && !!month,
  })
}

export function useExportProjectTimeEntries(projectId: string) {
  return useMutation({
    mutationFn: ({ start, end }: { start: string; end: string }) =>
      timeEntriesApi.exportProjectCsv(projectId, start, end),
  })
}
