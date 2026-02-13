import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ItemCombobox } from "@/components/ui/item-combobox"
import { TimesheetCell } from "./timesheet-cell"
import { useUpsertTimeEntry } from "@/hooks/use-time-entries"
import type { TimeEntry, Project } from "@/api/types"

interface TimesheetGridProps {
  entries: TimeEntry[]
  projects: Project[]
  weekStart: string
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function TimesheetGrid({
  entries,
  projects,
  weekStart,
}: TimesheetGridProps) {
  const upsertMutation = useUpsertTimeEntry()
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [addedProjectIds, setAddedProjectIds] = useState<string[]>([])
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set())

  const projectsWithEntries = useMemo(() => {
    const projectIds = new Set(entries.map((e) => e.projectId))
    return projects.filter((p) => projectIds.has(p.id))
  }, [entries, projects])

  const visibleProjects = useMemo(() => {
    const allIds = new Set([...projectsWithEntries.map((p) => p.id), ...addedProjectIds])
    return projects.filter((p) => allIds.has(p.id) && !hiddenProjectIds.has(p.id))
  }, [projectsWithEntries, addedProjectIds, hiddenProjectIds, projects])

  const availableProjects = useMemo(() => {
    const visibleIds = new Set(visibleProjects.map((p) => p.id))
    const hiddenArr = Array.from(hiddenProjectIds)
    return projects.filter((p) => !visibleIds.has(p.id) || hiddenArr.includes(p.id))
  }, [visibleProjects, hiddenProjectIds, projects])

  const handleHideProject = (projectId: string) => {
    setHiddenProjectIds((prev) => new Set([...prev, projectId]))
    setAddedProjectIds((prev) => prev.filter((id) => id !== projectId))
  }

  const getEntry = (projectId: string, date: string): TimeEntry | undefined => {
    return entries.find((e) => e.projectId === projectId && e.date === date)
  }

  const handleHoursChange = (projectId: string, date: string, hours: number) => {
    upsertMutation.mutate({
      projectId,
      date,
      hours,
    })
  }

  const calculateDailyTotals = (): number[] => {
    return weekDates.map((date) => {
      return entries
        .filter((e) => e.date === date)
        .reduce((sum, e) => sum + e.hours, 0)
    })
  }

  const calculateProjectTotal = (projectId: string): number => {
    return entries
      .filter((e) => e.projectId === projectId)
      .reduce((sum, e) => sum + e.hours, 0)
  }

  const calculateGrandTotal = (): number => {
    return entries.reduce((sum, e) => sum + e.hours, 0)
  }

  const dailyTotals = useMemo(() => calculateDailyTotals(), [entries, weekDates])
  const grandTotal = useMemo(() => calculateGrandTotal(), [entries])

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1.5 px-2 font-medium text-muted-foreground text-sm w-[180px]">
              Project
            </th>
            {weekDates.map((date, i) => (
              <th
                key={date}
                className="text-center py-1.5 px-1 font-medium text-muted-foreground"
              >
                <div className="text-xs">{DAYS[i]}</div>
                <div className="text-xs">{formatDate(date)}</div>
              </th>
            ))}
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-[80px] text-sm">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleProjects.map((project) => (
            <tr key={project.id} className="border-b hover:bg-muted/50 group">
              <td className="py-0.5 px-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-sm truncate">{project.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={() => handleHideProject(project.id)}
                    title="Hide from timesheet"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </td>
              {weekDates.map((date) => {
                const entry = getEntry(project.id, date)
                return (
                  <td key={date} className="p-0">
                    <TimesheetCell
                      value={entry?.hours || 0}
                      note={entry?.note}
                      onChange={(hours) => handleHoursChange(project.id, date, hours)}
                      disabled={upsertMutation.isPending}
                    />
                  </td>
                )
              })}
              <td className="p-0">
                <TimesheetCell
                  value={calculateProjectTotal(project.id)}
                  isTotal
                />
              </td>
            </tr>
          ))}

          {availableProjects.length > 0 && (
            <tr className="border-b">
              <td colSpan={9} className="py-1.5 px-2">
                <div className="flex items-center gap-2">
                  <ItemCombobox
                    items={availableProjects}
                    value={selectedProjectId}
                    onChange={(id) => {
                      setSelectedProjectId(id)
                      if (id) {
                        setAddedProjectIds((prev) => [...prev, id])
                        setHiddenProjectIds((prev) => {
                          const next = new Set(prev)
                          next.delete(id)
                          return next
                        })
                        setSelectedProjectId(null)
                      }
                    }}
                    getItemId={(p) => p.id}
                    getItemLabel={(p) => p.name}
                    placeholder="Add project..."
                    searchPlaceholder="Search projects..."
                    emptyLabel="No projects available"
                    className="w-[180px]"
                  />
                </div>
              </td>
            </tr>
          )}

          <tr className="border-t-2 font-medium bg-muted/30">
            <td className="py-1.5 px-2 text-sm">Daily Total</td>
            {dailyTotals.map((total, i) => (
              <td key={i} className="p-0">
                <TimesheetCell value={total} isTotal alignCenter />
              </td>
            ))}
            <td className="p-0">
              <TimesheetCell value={grandTotal} isTotal />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
