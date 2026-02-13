import { useState, useCallback } from "react"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useExportTimeEntries } from "@/hooks/use-time-entries"

interface TimesheetHeaderProps {
  currentDate: Date
  viewMode: "weekly" | "monthly"
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: "weekly" | "monthly") => void
}

export function TimesheetHeader({
  currentDate,
  viewMode,
  onDateChange,
  onViewModeChange,
}: TimesheetHeaderProps) {
  const exportMutation = useExportTimeEntries()

  const handlePrevious = useCallback(() => {
    const newDate = new Date(currentDate)
    if (viewMode === "weekly") {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    onDateChange(newDate)
  }, [currentDate, viewMode, onDateChange])

  const handleNext = useCallback(() => {
    const newDate = new Date(currentDate)
    if (viewMode === "weekly") {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    onDateChange(newDate)
  }, [currentDate, viewMode, onDateChange])

  const handleThisWeek = useCallback(() => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    const monday = new Date(today.setDate(diff))
    onDateChange(monday)
  }, [onDateChange])

  const getWeekRange = () => {
    const start = new Date(currentDate)
    const dayOfWeek = start.getDay()
    const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    start.setDate(diff)

    const end = new Date(start)
    end.setDate(end.getDate() + 6)

    const formatDate = (date: Date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

    return `${formatDate(start)} - ${formatDate(end)}, ${start.getFullYear()}`
  }

  const getMonthName = () => {
    return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }

  const handleExport = () => {
    let start: string
    let end: string

    if (viewMode === "weekly") {
      const weekStart = new Date(currentDate)
      const dayOfWeek = weekStart.getDay()
      const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      weekStart.setDate(diff)

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      start = weekStart.toISOString().slice(0, 10)
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
            onClick={() => onViewModeChange("weekly")}
          >
            Weekly
          </Button>
          <Button
            variant={viewMode === "monthly" ? "default" : "ghost"}
            size="sm"
            className="rounded-l-none"
            onClick={() => onViewModeChange("monthly")}
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
  )
}
