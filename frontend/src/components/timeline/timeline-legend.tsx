import type { TaskStatus } from "@/api/types"

interface TimelineLegendProps {
  statuses: TaskStatus[]
}

export function TimelineLegend({ statuses }: TimelineLegendProps) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {statuses.map((status) => (
        <div key={status.id} className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full border border-border"
            style={{ backgroundColor: status.color }}
          />
          <span>{status.name}</span>
        </div>
      ))}
    </div>
  )
}
