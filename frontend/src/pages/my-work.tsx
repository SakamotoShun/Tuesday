import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import type { Task } from "@/api/types"
import { useMyTasks, useTaskStatuses } from "@/hooks/use-tasks"
import { useProjects } from "@/hooks/use-projects"
import { useMyTimesheet, useMyMonthlyOverview } from "@/hooks/use-time-entries"
import { useAuth } from "@/hooks/use-auth"
import { TaskFilters } from "@/components/mywork/task-filters"
import { TaskGroupList } from "@/components/mywork/task-group-list"
import { EmptyState } from "@/components/common/empty-state"
import { LoadingSpinner } from "@/components/common/loading-spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AlertTriangle, Calendar, Clock, ListTodo, Search } from "@/lib/icons"
import { TimesheetHeader, TimesheetGrid, MonthlyOverview } from "@/components/timesheet"
import { isCompletedStatus } from "@/lib/task-status"

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

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null
  return new Date(`${value}T00:00:00`)
}

function isSameCalendarDay(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

function getDueDate(task: Task): Date | null {
  return parseDateOnly(task.dueDate)
}

function getTaskSortDate(task: Task): number {
  const dueDate = getDueDate(task)
  return dueDate ? dueDate.getTime() : Number.MAX_SAFE_INTEGER
}

type TaskSortMode = "urgency" | "dueDate" | "updated" | "alphabetical"

export function MyWorkPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { data: statuses } = useTaskStatuses()
  const { projects } = useProjects()
  const { data: tasks, isLoading: isTasksLoading } = useMyTasks()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<"project" | "status">("project")
  const [sortBy, setSortBy] = useState<TaskSortMode>("urgency")
  const [searchQuery, setSearchQuery] = useState("")
  const [showCompleted, setShowCompleted] = useState(false)

  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly")

  const weekStart = formatDateForWeek(getMonday(currentDate))
  const monthStr = formatDateForMonth(currentDate)

  const { data: timesheetData, isLoading: isTimesheetLoading } = useMyTimesheet(weekStart)
  const { data: monthlyOverviewData, isLoading: isMonthlyLoading } = useMyMonthlyOverview(monthStr)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const selectedStatus = useMemo(
    () => (statuses ?? []).find((status) => status.id === selectedStatusId) ?? null,
    [selectedStatusId, statuses]
  )

  const tasksWithinScope = useMemo(() => {
    if (!tasks) return []
    return tasks.filter((task) => {
      if (selectedProjectId && task.projectId !== selectedProjectId) return false
      if (selectedStatusId && task.statusId !== selectedStatusId) return false
      return true
    })
  }, [tasks, selectedProjectId, selectedStatusId])

  const actionableTasks = useMemo(
    () => tasksWithinScope.filter((task) => !isCompletedStatus(task.status?.name)),
    [tasksWithinScope]
  )

  const displayedTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return tasksWithinScope.filter((task) => {
      if (!showCompleted && isCompletedStatus(task.status?.name)) {
        return false
      }

      if (!query) {
        return true
      }

      const searchFields = [
        task.title,
        task.project?.name ?? "",
        task.status?.name ?? "",
        task.description ?? "",
      ]

      return searchFields.some((value) => value.toLowerCase().includes(query))
    })
  }, [tasksWithinScope, searchQuery, showCompleted])

  const dateContext = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekEnd = new Date(today)
    weekEnd.setDate(today.getDate() + 7)

    return { today, weekEnd }
  }, [])

  const taskPulse = useMemo(() => {
    const { today, weekEnd } = dateContext

    const overdue = actionableTasks.filter((task) => {
      const due = getDueDate(task)
      return due !== null && due < today
    })

    const dueToday = actionableTasks.filter((task) => {
      const due = getDueDate(task)
      return due !== null && isSameCalendarDay(due, today)
    })

    const dueThisWeek = actionableTasks.filter((task) => {
      const due = getDueDate(task)
      return due !== null && due > today && due <= weekEnd
    })

    const criticalNow = actionableTasks
      .filter((task) => {
        const due = getDueDate(task)
        return due !== null && due <= today
      })
      .sort((a, b) => getTaskSortDate(a) - getTaskSortDate(b))

    return {
      overdue,
      dueToday,
      dueThisWeek,
      criticalNow,
    }
  }, [actionableTasks, dateContext])

  const completedCount = useMemo(
    () => tasksWithinScope.filter((task) => isCompletedStatus(task.status?.name)).length,
    [tasksWithinScope]
  )

  const completionRate = useMemo(() => {
    if (tasksWithinScope.length === 0) return 0
    return Math.round((completedCount / tasksWithinScope.length) * 100)
  }, [completedCount, tasksWithinScope.length])

  const weeklyHours = useMemo(() => {
    if (!timesheetData) return 0
    return timesheetData.entries.reduce((sum, entry) => sum + entry.hours, 0)
  }, [timesheetData])

  const hasActiveFilters =
    selectedProjectId !== null ||
    selectedStatusId !== null ||
    searchQuery.trim().length > 0 ||
    showCompleted

  const clearFilters = () => {
    setSelectedProjectId(null)
    setSelectedStatusId(null)
    setSearchQuery("")
    setShowCompleted(false)
  }

  const activeTab = searchParams.get("tab") === "timesheet" ? "timesheet" : "tasks"

  const handleTabChange = (value: string) => {
    const nextParams = new URLSearchParams(searchParams)

    if (value === "tasks") {
      nextParams.delete("tab")
    } else {
      nextParams.set("tab", value)
    }

    setSearchParams(nextParams, { replace: true })
  }

  const pulseCards = [
    {
      label: "Overdue",
      value: taskPulse.overdue.length,
      hint: "Needs immediate attention",
      icon: AlertTriangle,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
    {
      label: "Due Today",
      value: taskPulse.dueToday.length,
      hint: "Do these today",
      icon: Calendar,
      className: "border-secondary/35 bg-secondary/10 text-secondary",
    },
    {
      label: "Due This Week",
      value: taskPulse.dueThisWeek.length,
      hint: "Coming up next",
      icon: ListTodo,
      className: "border-primary/35 bg-primary/10 text-primary",
    },
    {
      label: "Hours This Week",
      value: weeklyHours.toFixed(1),
      hint: "Hours you logged",
      icon: Clock,
      tabValue: "timesheet" as const,
      className: "border-border bg-card text-foreground",
    },
  ]

  return (
    <div className="space-y-6 pb-8">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <section className="rounded-3xl border border-border bg-card px-5 py-5 shadow-sm md:px-6 md:py-6">
          <div className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Daily Operations
                </p>
                <h1 className="font-serif text-[32px] leading-tight md:text-[38px]">My Work</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Your task hub. Check urgent work first, then sort the rest by project, status,
                  or due date.
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/80 px-4 py-3 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Completion snapshot
                </p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-3xl font-semibold leading-none">{completionRate}%</span>
                  <span className="pb-0.5 text-xs text-muted-foreground">
                    {completedCount} of {tasksWithinScope.length} tasks done
                  </span>
                </div>
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
                      {card.tabValue ? (
                        <button
                          type="button"
                          onClick={() => handleTabChange(card.tabValue)}
                          className={`rounded-lg border px-2 py-2 transition-colors hover:border-primary/35 hover:bg-primary/10 ${card.className}`}
                          aria-label="Open timesheet"
                          title="Open timesheet"
                        >
                          <card.icon className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className={`rounded-lg border px-2 py-2 ${card.className}`}>
                          <card.icon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{card.hint}</p>
                  </div>
                </article>
              ))}
            </div>

            <TabsList
              data-tour="my-work-tabs"
              className="h-auto rounded-xl border border-border/80 bg-background/80 p-1"
            >
              <TabsTrigger
                value="tasks"
                data-tour="my-work-tasks-tab"
                className="rounded-lg px-4 py-2 text-sm"
              >
                Tasks
              </TabsTrigger>
              <TabsTrigger
                value="timesheet"
                data-tour="my-work-timesheet-tab"
                className="rounded-lg px-4 py-2 text-sm"
              >
                Timesheet
              </TabsTrigger>
            </TabsList>
          </div>
        </section>

        <TabsContent value="tasks" className="mt-0 space-y-6">
          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Critical now</h2>
                <p className="text-xs text-muted-foreground">
                  Overdue and due-today tasks are listed first.
                </p>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                {taskPulse.criticalNow.length} in queue
              </span>
            </div>

            {isTasksLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : taskPulse.criticalNow.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                No urgent tasks right now. Check what is due this week.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {taskPulse.criticalNow.slice(0, 6).map((task, index) => (
                  <div
                    key={task.id}
                    className="animate-in fade-in slide-in-from-bottom-1 duration-700"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${task.projectId}/tasks`)}
                      className="group relative w-full rounded-xl border border-border bg-background px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-destructive/40 hover:shadow-md"
                    >
                      <div className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-destructive/70 opacity-70 transition-opacity group-hover:opacity-100" />
                      <div className="pl-2">
                        <p className="line-clamp-1 text-sm font-semibold">{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{task.project?.name ?? "Project"}</span>
                          <span>•</span>
                          <span>
                            Due {getDueDate(task)?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          {task.status?.name && (
                            <>
                              <span>•</span>
                              <span>{task.status.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="space-y-3">
              <TaskFilters
                projects={projects}
                statuses={statuses ?? []}
                selectedProjectId={selectedProjectId}
                selectedStatusId={selectedStatusId}
                onProjectChange={setSelectedProjectId}
                onStatusChange={setSelectedStatusId}
              />

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_170px_170px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="my-work-search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search tasks"
                    className="h-11 bg-background pl-9"
                  />
                </div>

                <div className="flex h-11 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                  <label htmlFor="my-work-include-completed" className="text-sm text-muted-foreground">
                    Include completed
                  </label>
                  <Switch
                    id="my-work-include-completed"
                    checked={showCompleted}
                    onCheckedChange={setShowCompleted}
                  />
                </div>

                <Select
                  value={groupBy}
                  onValueChange={(value) => setGroupBy(value as "project" | "status")}
                >
                  <SelectTrigger className="h-11 bg-background">
                    <SelectValue placeholder="Group by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Group: project</SelectItem>
                    <SelectItem value="status">Group: status</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as TaskSortMode)}
                >
                  <SelectTrigger className="h-11 bg-background">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgency">Sort: urgency</SelectItem>
                    <SelectItem value="dueDate">Sort: due date</SelectItem>
                    <SelectItem value="updated">Sort: recently updated</SelectItem>
                    <SelectItem value="alphabetical">Sort: alphabetical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                  Showing {displayedTasks.length} tasks
                </span>
                {selectedProject && (
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-primary">
                    Project: {selectedProject.name}
                  </span>
                )}
                {selectedStatus && (
                  <span
                    className="rounded-full border px-3 py-1"
                    style={{ borderColor: `${selectedStatus.color}55`, color: selectedStatus.color }}
                  >
                    Status: {selectedStatus.name}
                  </span>
                )}
                {searchQuery.trim().length > 0 && (
                  <span className="rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                    Search: {searchQuery.trim()}
                  </span>
                )}
              </div>

              {hasActiveFilters && (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            {isTasksLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : displayedTasks.length === 0 ? (
              <EmptyState
                title="No matching tasks"
                description="Try clearing a filter or search term."
              />
            ) : (
              <TaskGroupList
                tasks={displayedTasks}
                groupBy={groupBy}
                sortBy={sortBy}
                onSelect={(task) => navigate(`/projects/${task.projectId}/tasks`)}
              />
            )}
          </section>
        </TabsContent>

        <TabsContent value="timesheet" className="mt-0">
          <div className="space-y-6 rounded-2xl border border-border bg-card p-4 md:p-6" data-tour="my-work-timesheet-panel">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">This Week</p>
                <p className="mt-1 text-2xl font-semibold leading-none">{weeklyHours.toFixed(1)}h</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Monthly Total</p>
                <p className="mt-1 text-2xl font-semibold leading-none">
                  {monthlyOverviewData ? `${monthlyOverviewData.grandTotal.toFixed(1)}h` : "--"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Active Tasks</p>
                <p className="mt-1 text-2xl font-semibold leading-none">{actionableTasks.length}</p>
              </div>
            </div>

            <TimesheetHeader
              currentDate={currentDate}
              viewMode={viewMode}
              onDateChange={setCurrentDate}
              onViewModeChange={setViewMode}
            />

            {viewMode === "weekly" ? (
              isTimesheetLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : timesheetData ? (
                <div className="rounded-xl border border-border bg-background p-2">
                  <TimesheetGrid
                    entries={timesheetData.entries}
                    projects={projects}
                    weekStart={timesheetData.weekStart}
                    allowMisc={user?.role !== "freelancer"}
                  />
                </div>
              ) : (
                <EmptyState
                  title="No time entries"
                  description="Start tracking your time by adding hours to projects."
                />
              )
            ) : isMonthlyLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : monthlyOverviewData ? (
              <div className="rounded-xl border border-border bg-background p-4">
                <MonthlyOverview data={monthlyOverviewData} />
              </div>
            ) : (
              <EmptyState
                title="No time entries"
                description="Start tracking your time to see monthly overview."
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
