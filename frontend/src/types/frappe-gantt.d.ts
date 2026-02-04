declare module "frappe-gantt" {
  type GanttTask = {
    id: string
    name: string
    start: string
    end: string
    progress?: number
    custom_class?: string
  }

  type GanttOptions = {
    view_mode?: "Day" | "Week" | "Month" | "Year"
    on_click?: (task: GanttTask) => void
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void
    bar_height?: number
    padding?: number
  }

  export default class Gantt {
    constructor(target: HTMLElement, tasks: GanttTask[], options?: GanttOptions)
    refresh(tasks: GanttTask[]): void
  }
}
