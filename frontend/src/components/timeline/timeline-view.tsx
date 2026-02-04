import { useEffect, useMemo, useRef } from "react"
import Gantt from "frappe-gantt"
import "frappe-gantt/dist/frappe-gantt.css"
import { cn } from "@/lib/utils"

export type TimelineTask = {
  id: string
  name: string
  start: string
  end: string
  progress?: number
  custom_class?: string
}

interface TimelineViewProps {
  tasks: TimelineTask[]
  viewMode: "Day" | "Week" | "Month"
  onTaskClick?: (taskId: string) => void
  onDateChange?: (taskId: string, start: Date, end: Date) => void
  className?: string
  statusStyles?: Record<string, string>
}

export function TimelineView({
  tasks,
  viewMode,
  onTaskClick,
  onDateChange,
  className,
  statusStyles,
}: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const styleMarkup = useMemo(() => {
    if (!statusStyles) return ""
    return Object.entries(statusStyles)
      .map(([className, color]) => {
        return `
.gantt .bar.${className} { fill: ${color}; }
.gantt .bar.${className} .bar-progress { fill: ${color}; }
`
      })
      .join("")
  }, [statusStyles])

  useEffect(() => {
    if (!containerRef.current) return

    containerRef.current.innerHTML = ""
    const gantt = new Gantt(containerRef.current, tasks, {
      view_mode: viewMode,
      on_click: (task: TimelineTask) => {
        onTaskClick?.(task.id)
      },
      on_date_change: (task: TimelineTask, start: Date, end: Date) => {
        onDateChange?.(task.id, start, end)
      },
      bar_height: 32,
      padding: 24,
    })

    gantt.refresh(tasks)
  }, [tasks, viewMode, onTaskClick, onDateChange])

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {styleMarkup ? <style>{styleMarkup}</style> : null}
      <div ref={containerRef} className="timeline-gantt" />
    </div>
  )
}
