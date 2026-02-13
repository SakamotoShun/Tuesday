import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/common/loading-spinner"
import {
  useProjectTimesheet,
  useProjectMonthlyOverview,
  useExportProjectTimeEntries,
} from "@/hooks/use-time-entries"
import type { TimeEntry, ProjectMonthlyOverview } from "@/api/types"

interface ProjectTimeReportProps {
  projectId: string
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function formatDateForWeek(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatDateForMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    return date.toISOString().slice(0, 10)
  })
}

export function ProjectTimeReport({ projectId }: ProjectTimeReportProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly")

  const weekStart = formatDateForWeek(getMonday(currentDate))
  const monthStr = formatDateForMonth(currentDate)

  const { data: timesheetData, isLoading: isTimesheetLoading } = useProjectTimesheet(
    projectId,
    weekStart
  )
  const { data: monthlyData, isLoading: isMonthlyLoading } = useProjectMonthlyOverview(
    projectId,
    monthStr
  )
  const exportMutation = useExportProjectTimeEntries(projectId)

  const handlePrevious = () => {
    const newDate = new Date(currentDate)
    if (viewMode === "weekly") {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === "weekly") {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  const handleThisWeek = () => {
    const today = new Date()
    const monday = getMonday(today)
    setCurrentDate(monday)
  }

  const getWeekRange = () => {
    const start = new Date(weekStart)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return `${formatDate(weekStart)} - ${formatDate(end.toISOString().slice(0, 10))}, ${start.getFullYear()}`
  }

  const getMonthName = () => {
    return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }

  const handleExport = () => {
    let start: string
    let end: string

    if (viewMode === "weekly") {
      start = weekStart
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      end = weekEnd.toISOString().slice(0, 10)
    } else {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      start = new Date(year, month, 1).toISOString().slice(0, 10)
      end = new Date(year, month + 1, 0).toISOString().slice(0, 10)
    }

    exportMutation.mutate({ start, end })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[200px] text-center font-medium">
            {viewMode === "weekly" ? getWeekRange() : getMonthName()}
          </div>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {viewMode === "weekly" && (
            <Button variant="outline" size="sm" onClick={handleThisWeek}>
              This Week
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "weekly" ? "default" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("weekly")}
            >
              Weekly
            </Button>
            <Button
              variant={viewMode === "monthly" ? "default" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("monthly")}
            >
              Monthly
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {viewMode === "weekly" ? (
        isTimesheetLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : timesheetData ? (
          <WeeklyUserGrid entries={timesheetData.entries} weekStart={timesheetData.weekStart} />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No time entries for this week
          </div>
        )
      ) : isMonthlyLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : monthlyData ? (
        <ProjectMonthlyOverviewGrid data={monthlyData} />
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No time entries for this month
        </div>
      )}
    </div>
  )
}

function WeeklyUserGrid({ entries, weekStart }: { entries: TimeEntry[]; weekStart: string }) {
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  const users = useMemo(() => {
    const userMap = new Map<string, { id: string; name: string; email: string }>()
    for (const entry of entries) {
      if (entry.user && !userMap.has(entry.userId)) {
        userMap.set(entry.userId, {
          id: entry.user.id,
          name: entry.user.name,
          email: entry.user.email,
        })
      }
    }
    return Array.from(userMap.values())
  }, [entries])

  const getEntry = (userId: string, date: string): TimeEntry | undefined => {
    return entries.find((e) => e.userId === userId && e.date === date)
  }

  const calculateUserTotal = (userId: string): number => {
    return entries.filter((e) => e.userId === userId).reduce((sum, e) => sum + e.hours, 0)
  }

  const calculateDailyTotals = (): number[] => {
    return weekDates.map((date) => {
      return entries.filter((e) => e.date === date).reduce((sum, e) => sum + e.hours, 0)
    })
  }

  const grandTotal = entries.reduce((sum, e) => sum + e.hours, 0)
  const dailyTotals = calculateDailyTotals()

  if (users.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No time entries for this week
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Team Member</th>
            {weekDates.map((date, i) => (
              <th
                key={date}
                className="text-center py-2 px-1 font-medium text-muted-foreground min-w-[70px]"
              >
                <div className="text-xs">{DAYS[i]}</div>
                <div className="text-sm">{formatDate(date)}</div>
              </th>
            ))}
            <th className="text-right py-2 px-3 font-medium text-muted-foreground min-w-[60px]">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-muted/50">
              <td className="py-2 px-3">
                <div className="font-medium text-sm">{user.name}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </td>
              {weekDates.map((date) => {
                const entry = getEntry(user.id, date)
                return (
                  <td key={date} className="py-2 px-1 text-center tabular-nums text-sm">
                    {entry ? entry.hours.toFixed(1) : "—"}
                  </td>
                )
              })}
              <td className="py-2 px-3 text-right font-medium tabular-nums">
                {calculateUserTotal(user.id).toFixed(1)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 font-medium bg-muted/30">
            <td className="py-2 px-3">Daily Total</td>
            {dailyTotals.map((total, i) => (
              <td key={i} className="py-2 px-1 text-center tabular-nums">
                {total > 0 ? total.toFixed(1) : "—"}
              </td>
            ))}
            <td className="py-2 px-3 text-right font-bold tabular-nums">{grandTotal.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ProjectMonthlyOverviewGrid({ data }: { data: ProjectMonthlyOverview }) {
  const { year, month, weeks, userTotals, grandTotal } = data

  const formatWeekRange = (weekStart: string, weekEnd: string): string => {
    const start = new Date(weekStart)
    const end = new Date(weekEnd)
    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`
  }

  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  if (userTotals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No time entries for this month
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-medium">{monthName}</div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Week</th>
              {userTotals.map((u) => (
                <th
                  key={u.userId}
                  className="text-right py-2 px-3 font-medium text-muted-foreground min-w-[80px]"
                >
                  {u.userName}
                </th>
              ))}
              <th className="text-right py-2 px-3 font-medium text-muted-foreground min-w-[80px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekNumber} className="border-b hover:bg-muted/50">
                <td className="py-2 px-3 text-sm">
                  Week {week.weekNumber}
                  <span className="text-muted-foreground ml-2">
                    ({formatWeekRange(week.weekStart, week.weekEnd)})
                  </span>
                </td>
                {userTotals.map((user) => {
                  const userWeekTotal = week.userTotals.find((u) => u.userId === user.userId)
                  return (
                    <td key={user.userId} className="py-2 px-3 text-right tabular-nums">
                      {userWeekTotal ? userWeekTotal.hours.toFixed(1) : "—"}
                    </td>
                  )
                })}
                <td className="py-2 px-3 text-right font-medium tabular-nums">
                  {week.totalHours.toFixed(1)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 font-medium bg-muted/30">
              <td className="py-2 px-3">Monthly Total</td>
              {userTotals.map((user) => (
                <td key={user.userId} className="py-2 px-3 text-right tabular-nums">
                  {user.hours.toFixed(1)}
                </td>
              ))}
              <td className="py-2 px-3 text-right font-bold tabular-nums">
                {grandTotal.toFixed(1)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
