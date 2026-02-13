import { api } from "./client"
import type {
  TimeEntry,
  UpsertTimeEntryInput,
  WeeklyTimesheet,
  MonthlyOverview,
  ProjectMonthlyOverview,
} from "./types"

type BackendTimeEntry = Omit<TimeEntry, "hours"> & { hours: string }

const normalizeTimeEntry = (entry: BackendTimeEntry): TimeEntry => {
  return {
    ...entry,
    hours: parseFloat(entry.hours) || 0,
  }
}

export const timeEntriesApi = {
  getMyWeeklyTimesheet: async (week: string): Promise<WeeklyTimesheet> => {
    const data = await api.get<{ entries: BackendTimeEntry[]; weekStart: string; weekEnd: string }>(
      `/time-entries/my?week=${week}`
    )
    return {
      ...data,
      entries: data.entries.map(normalizeTimeEntry),
    }
  },

  getMyMonthlyOverview: async (month: string): Promise<MonthlyOverview> => {
    return api.get<MonthlyOverview>(`/time-entries/my/overview?month=${month}`)
  },

  upsert: async (input: UpsertTimeEntryInput): Promise<TimeEntry> => {
    const entry = await api.put<BackendTimeEntry>("/time-entries", input)
    return normalizeTimeEntry(entry)
  },

  delete: async (entryId: string): Promise<void> => {
    return api.delete<void>(`/time-entries/${entryId}`)
  },

  exportCsv: async (start: string, end: string): Promise<void> => {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || ""}/api/v1/time-entries/my/export?start=${start}&end=${end}`,
      { credentials: "include" }
    )
    if (!response.ok) throw new Error("Failed to export timesheet")
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `timesheet-${start}-to-${end}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  },

  getProjectWeeklyTimesheet: async (projectId: string, week: string): Promise<WeeklyTimesheet> => {
    const data = await api.get<{ entries: BackendTimeEntry[]; weekStart: string; weekEnd: string }>(
      `/projects/${projectId}/time-entries?week=${week}`
    )
    return {
      ...data,
      entries: data.entries.map(normalizeTimeEntry),
    }
  },

  getProjectMonthlyOverview: async (
    projectId: string,
    month: string
  ): Promise<ProjectMonthlyOverview> => {
    return api.get<ProjectMonthlyOverview>(
      `/projects/${projectId}/time-entries/overview?month=${month}`
    )
  },

  exportProjectCsv: async (projectId: string, start: string, end: string): Promise<void> => {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || ""}/api/v1/projects/${projectId}/time-entries/export?start=${start}&end=${end}`,
      { credentials: "include" }
    )
    if (!response.ok) throw new Error("Failed to export project timesheet")
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `project-${projectId}-timesheet-${start}-to-${end}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  },
}
