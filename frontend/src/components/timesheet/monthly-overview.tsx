import type { MonthlyOverview as MonthlyOverviewType } from "@/api/types"
import { cn } from "@/lib/utils"

interface MonthlyOverviewProps {
  data: MonthlyOverviewType
}

export function MonthlyOverview({ data }: MonthlyOverviewProps) {
  const { year, month, weeks, projectTotals, grandTotal } = data

  const formatWeekRange = (weekStart: string, weekEnd: string): string => {
    const start = new Date(weekStart)
    const end = new Date(weekEnd)
    const formatDate = (date: Date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return `${formatDate(start)} - ${formatDate(end)}`
  }

  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="space-y-4">
      <div className="text-lg font-medium">{monthName}</div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                Week
              </th>
              {projectTotals.map((p) => (
                <th
                  key={p.projectId}
                  className="text-right py-2 px-3 font-medium text-muted-foreground min-w-[80px]"
                >
                  {p.projectName}
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
                {projectTotals.map((project) => {
                  const projectWeekTotal = week.projectTotals.find(
                    (p) => p.projectId === project.projectId
                  )
                  return (
                    <td
                      key={project.projectId}
                      className="py-2 px-3 text-right tabular-nums"
                    >
                      {projectWeekTotal ? projectWeekTotal.hours.toFixed(1) : "—"}
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
              {projectTotals.map((project) => (
                <td
                  key={project.projectId}
                  className="py-2 px-3 text-right tabular-nums"
                >
                  {project.hours.toFixed(1)}
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
