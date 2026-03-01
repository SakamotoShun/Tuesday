import { useMemo, type ComponentType } from "react"
import { Link } from "react-router-dom"
import type { Task } from "@/api/types"
import { AlertTriangle, Calendar, FolderKanban, ListTodo, RefreshCcw } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  HomeWidgetBoard,
  type HomeWidgetDefinition,
  type HomeWidgetId,
} from "@/components/home/widget-board"
import { ChatView } from "@/components/chat/chat-view"
import { ProjectListCompact } from "@/components/dashboard/project-list-compact"
import { NoticeBoardCard } from "@/components/notice-board/notice-board-card"
import { LoadingSpinner } from "@/components/common/loading-spinner"
import { useAuth } from "@/hooks/use-auth"
import { useMyMeetings } from "@/hooks/use-meetings"
import { useProjects } from "@/hooks/use-projects"
import { useMyTasks } from "@/hooks/use-tasks"
import { isCompletedStatus } from "@/lib/task-status"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/store/ui-store"

function formatDayHeader() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

function getTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}

function isSameCalendarDay(dateA: Date, dateB: Date) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

function parseDateOnly(value: string | null) {
  if (!value) return null
  return new Date(`${value}T00:00:00`)
}

function formatDueDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function formatMeetingTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function sortByDueDate(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const aDate = parseDateOnly(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bDate = parseDateOnly(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return aDate - bDate
  })
}

function TaskRows({
  tasks,
  emptyText,
  tone = "default",
}: {
  tasks: Task[]
  emptyText: string
  tone?: "default" | "overdue"
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 transition-all hover:-translate-y-0.5 hover:shadow-sm",
            tone === "overdue" ? "border-destructive/35" : "border-border"
          )}
        >
          <div className="min-w-0">
            <Link
              to={`/projects/${task.projectId}/tasks`}
              className="line-clamp-1 text-sm font-medium hover:underline"
            >
              {task.title}
            </Link>
            <p className="text-xs text-muted-foreground">{task.project?.name ?? "Project"}</p>
          </div>
          {task.dueDate && (
            <span
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium",
                tone === "overdue"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground"
              )}
            >
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

interface PulseCard {
  label: string
  value: string
  hint: string
  icon: ComponentType<{ className?: string }>
  className: string
  href?: string
}

const WIDGET_TITLES: Record<HomeWidgetId, string> = {
  focus: "Focus Today",
  notices: "Notice Board",
  meetings: "Today's Meetings",
  projects: "My Projects",
  chat: "Chat",
}

export function HomePage() {
  const { user } = useAuth()
  const { data: tasks, isLoading: isTasksLoading } = useMyTasks()
  const { data: meetings } = useMyMeetings()
  const { projects } = useProjects()

  const homeWidgetLayout = useUIStore((state) => state.homeWidgetLayout)
  const homeHiddenWidgets = useUIStore((state) => state.homeHiddenWidgets)
  const setHomeWidgetLayout = useUIStore((state) => state.setHomeWidgetLayout)
  const toggleHomeWidgetVisibility = useUIStore((state) => state.toggleHomeWidgetVisibility)
  const resetHomeLayout = useUIStore((state) => state.resetHomeLayout)

  const actionableTasks = useMemo(
    () => (tasks ?? []).filter((task) => !isCompletedStatus(task.status?.name)),
    [tasks]
  )

  const overdueTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const overdue = actionableTasks.filter((task) => {
      const dueDate = parseDateOnly(task.dueDate)
      return dueDate !== null && dueDate < today
    })

    return sortByDueDate(overdue)
  }, [actionableTasks])

  const dueTodayTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueToday = actionableTasks.filter((task) => {
      const dueDate = parseDateOnly(task.dueDate)
      return dueDate !== null && isSameCalendarDay(dueDate, today)
    })

    return sortByDueDate(dueToday)
  }, [actionableTasks])

  const dueSoonTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekEnd = new Date(today)
    weekEnd.setDate(today.getDate() + 7)

    const dueSoon = actionableTasks.filter((task) => {
      const dueDate = parseDateOnly(task.dueDate)
      return dueDate !== null && dueDate > today && dueDate <= weekEnd
    })

    return sortByDueDate(dueSoon)
  }, [actionableTasks])

  const todaysMeetings = useMemo(() => {
    const today = new Date()
    return (meetings ?? [])
      .filter((meeting) => isSameCalendarDay(new Date(meeting.startTime), today))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [meetings])

  const projectRows = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((project) => ({
        id: project.id,
        name: project.name,
        statusName: project.status?.name ?? "No status",
        updatedAt: project.updatedAt,
      }))
  }, [projects])

  const pulseCards: PulseCard[] = [
    {
      label: "Overdue",
      value: String(overdueTasks.length),
      hint: "Needs attention now",
      icon: AlertTriangle,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
    {
      label: "Due Today",
      value: String(dueTodayTasks.length),
      hint: "Plan these first",
      icon: Calendar,
      className: "border-secondary/35 bg-secondary/10 text-secondary",
    },
    {
      label: "Due This Week",
      value: String(dueSoonTasks.length),
      hint: "Next seven days",
      icon: ListTodo,
      className: "border-primary/35 bg-primary/10 text-primary",
    },
    {
      label: "Active Projects",
      value: String(projects.length),
      hint: "Current scope",
      icon: FolderKanban,
      className: "border-border bg-card text-foreground",
      href: "/projects",
    },
  ]

  const widgets = useMemo<HomeWidgetDefinition[]>(
    () => [
      {
        id: "focus",
        title: "Focus Today",
        subtitle: "Overdue and due-today queue",
        minColSpan: 1,
        maxColSpan: 2,
        minRowSpan: 1,
        maxRowSpan: 3,
        content: isTasksLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold">Overdue</h4>
              <TaskRows tasks={overdueTasks.slice(0, 5)} emptyText="No overdue tasks." tone="overdue" />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Due Today</h4>
              <TaskRows tasks={dueTodayTasks.slice(0, 5)} emptyText="Nothing due today." />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Due This Week</h4>
              <TaskRows tasks={dueSoonTasks.slice(0, 4)} emptyText="Nothing due this week." />
            </div>
          </div>
        ),
      },
      {
        id: "notices",
        title: "Notice Board",
        subtitle: "Announcements and team todos",
        minColSpan: 1,
        maxColSpan: 2,
        minRowSpan: 1,
        maxRowSpan: 3,
        content: <NoticeBoardCard embedded className="h-full" />,
      },
      {
        id: "meetings",
        title: "Today's Meetings",
        subtitle: `${todaysMeetings.length} planned`,
        minColSpan: 1,
        maxColSpan: 2,
        minRowSpan: 1,
        maxRowSpan: 3,
        content:
          todaysMeetings.length === 0 ? (
            <p className="rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
              No meetings scheduled for today.
            </p>
          ) : (
            <div className="space-y-2">
              {todaysMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link to="/my-calendar" className="line-clamp-1 text-sm font-medium hover:underline">
                      {meeting.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{meeting.project?.name ?? "Personal"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatMeetingTime(meeting.startTime)} - {formatMeetingTime(meeting.endTime)}
                  </span>
                </div>
              ))}
            </div>
          ),
      },
      {
        id: "projects",
        title: "My Projects",
        subtitle: "Recent updates and quick links",
        minColSpan: 1,
        maxColSpan: 3,
        minRowSpan: 1,
        maxRowSpan: 2,
        content: <ProjectListCompact projects={projectRows} />,
      },
      {
        id: "chat",
        title: "Chat",
        subtitle: "Coordination across teams",
        minColSpan: 1,
        maxColSpan: 4,
        minRowSpan: 1,
        maxRowSpan: 5,
        bodyClassName: "overflow-hidden p-0",
        content: (
          <div className="flex h-full min-h-0">
            <ChatView title="Home Chat" variant="page" />
          </div>
        ),
      },
    ],
    [
      dueSoonTasks,
      dueTodayTasks,
      isTasksLoading,
      overdueTasks,
      projectRows,
      todaysMeetings,
    ]
  )

  const hiddenWidgets = homeHiddenWidgets.filter((widgetId) => WIDGET_TITLES[widgetId])

  const handleRestoreWidget = (widgetId: HomeWidgetId) => {
    toggleHomeWidgetVisibility(widgetId)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <section className="rounded-3xl border border-border bg-card px-5 py-5 shadow-sm md:px-6 md:py-6">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Daily Brief
              </p>
              <h1 className="font-serif text-[30px] font-bold leading-tight md:text-[36px]">
                Good {getTimeOfDay()}, {user?.name?.split(" ")[0] ?? "there"}
              </h1>
              <p className="text-sm text-muted-foreground">{formatDayHeader()}</p>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button asChild variant="outline" className="h-10">
                <Link to="/my-work">Open My Work</Link>
              </Button>
              <Button type="button" variant="outline" className="h-10" onClick={resetHomeLayout}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset layout
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {pulseCards.map((card, index) => (
              <article
                key={card.label}
                className="animate-in fade-in slide-in-from-bottom-1 duration-700"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="rounded-2xl border border-border/80 bg-background/80 p-3 backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {card.label}
                      </p>
                      <p className="mt-1 text-2xl font-semibold leading-none">{card.value}</p>
                    </div>
                    {card.href ? (
                      <Link
                        to={card.href}
                        className={cn(
                          "rounded-lg border px-2 py-2 transition-colors hover:border-primary/35 hover:bg-primary/10",
                          card.className
                        )}
                        aria-label="Open projects"
                        title="Open projects"
                      >
                        <card.icon className="h-4 w-4" />
                      </Link>
                    ) : (
                      <div className={cn("rounded-lg border px-2 py-2", card.className)}>
                        <card.icon className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{card.hint}</p>
                </div>
              </article>
            ))}
          </div>

          {hiddenWidgets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Hidden widgets:</span>
              {hiddenWidgets.map((widgetId) => (
                <Button
                  key={widgetId}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleRestoreWidget(widgetId)}
                >
                  Show {WIDGET_TITLES[widgetId]}
                </Button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-hidden">
        <HomeWidgetBoard
          widgets={widgets}
          layout={homeWidgetLayout}
          hiddenWidgetIds={homeHiddenWidgets}
          onLayoutChange={setHomeWidgetLayout}
          onHideWidget={toggleHomeWidgetVisibility}
        />
      </div>
    </div>
  )
}
