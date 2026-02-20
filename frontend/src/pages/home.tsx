import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChatView } from "@/components/chat/chat-view"
import { ProjectListCompact } from "@/components/dashboard/project-list-compact"
import { useAuth } from "@/hooks/use-auth"
import { useMyMeetings } from "@/hooks/use-meetings"
import { useProjects } from "@/hooks/use-projects"
import { useMyTasks } from "@/hooks/use-tasks"
import type { Task } from "@/api/types"

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

function TaskRows({ tasks, emptyText, overdue = false }: { tasks: Task[]; emptyText: string; overdue?: boolean }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
          <div className="min-w-0">
            <Link to={`/projects/${task.projectId}/tasks`} className="line-clamp-1 text-sm font-medium hover:underline">
              {task.title}
            </Link>
            <p className="text-xs text-muted-foreground">{task.project?.name ?? "Project"}</p>
          </div>
          {task.dueDate && (
            <span className={`text-xs font-medium ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const { data: tasks } = useMyTasks()
  const { data: meetings } = useMyMeetings()
  const { projects } = useProjects()

  const overdueTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return (tasks ?? [])
      .filter((task) => {
        const dueDate = parseDateOnly(task.dueDate)
        return dueDate !== null && dueDate < today
      })
      .sort((a, b) => new Date(a.dueDate ?? "").getTime() - new Date(b.dueDate ?? "").getTime())
  }, [tasks])

  const dueSoonTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekEnd = new Date(today)
    weekEnd.setDate(today.getDate() + 7)

    return (tasks ?? [])
      .filter((task) => {
        const dueDate = parseDateOnly(task.dueDate)
        return dueDate !== null && dueDate >= today && dueDate <= weekEnd
      })
      .sort((a, b) => new Date(a.dueDate ?? "").getTime() - new Date(b.dueDate ?? "").getTime())
  }, [tasks])

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

  return (
    <div className="flex h-[calc(100vh-72px-4rem)] min-h-0 w-full flex-col gap-6 overflow-hidden">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-[30px] font-bold leading-tight">
            Good {getTimeOfDay()}, {user?.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-sm text-muted-foreground">{formatDayHeader()}</p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to="/my-work">Go to My Work</Link>
        </Button>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[1.1fr_1fr] xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-h-0 flex flex-col gap-2 xl:col-start-1 xl:row-start-1">
          <h2 className="text-lg font-semibold">Focus Today</h2>
          <Card className="min-h-0 flex-1">
            <CardContent className="h-full min-h-0 space-y-5 overflow-y-auto pt-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Overdue Tasks</h3>
                <TaskRows tasks={overdueTasks} emptyText="No overdue tasks." overdue />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Due in the Next 7 Days</h3>
                <TaskRows tasks={dueSoonTasks} emptyText="Nothing due in the next 7 days." />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Today&apos;s Meetings</h3>
                {todaysMeetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No meetings scheduled for today.</p>
                ) : (
                  <div className="space-y-2">
                    {todaysMeetings.map((meeting) => (
                      <div
                        key={meeting.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
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
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="min-h-0 flex flex-col gap-2 xl:col-start-2 xl:row-span-2">
          <div>
            <h2 className="text-lg font-semibold">Chat</h2>
          </div>
          <div className="min-h-0 flex flex-1 overflow-hidden">
            <ChatView title="Home Chat" />
          </div>
        </section>

        <section className="min-h-0 flex flex-col gap-2 xl:col-start-1 xl:row-start-2">
          <h2 className="text-lg font-semibold">My Projects</h2>
          <Card className="min-h-0 flex-1">
            <CardContent className="h-full min-h-0 overflow-y-auto pt-6">
              <ProjectListCompact projects={projectRows} />
            </CardContent>
          </Card>
        </section>
      </section>
    </div>
  )
}
