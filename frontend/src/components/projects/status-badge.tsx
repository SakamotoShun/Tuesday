import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: string | null | undefined
}

const statusStyles: Record<string, string> = {
  Active: "bg-success/10 text-success border-success/20",
  Planning: "bg-info/10 text-info border-info/20",
  "On Hold": "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-muted/50 text-muted-foreground border-border",
  Archived: "bg-muted/50 text-muted-foreground border-border",
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) return null

  const style = statusStyles[status] || "bg-muted/50 text-muted-foreground border-border"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        style
      )}
    >
      {status}
    </span>
  )
}
