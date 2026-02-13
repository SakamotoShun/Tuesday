import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMyTasks, useTaskStatuses } from "@/hooks/use-tasks"
import { useProjects } from "@/hooks/use-projects"
import { useMyTimesheet, useMyMonthlyOverview } from "@/hooks/use-time-entries"
import { TaskFilters } from "@/components/mywork/task-filters"
import { TaskGroupList } from "@/components/mywork/task-group-list"
import { EmptyState } from "@/components/common/empty-state"
import { LoadingSpinner } from "@/components/common/loading-spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TimesheetHeader, TimesheetGrid, MonthlyOverview } from "@/components/timesheet"

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

export function MyWorkPage() {
  const navigate = useNavigate()
  const { data: statuses } = useTaskStatuses()
  const { projects } = useProjects()
  const { data: tasks, isLoading: isTasksLoading } = useMyTasks()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<"project" | "status">("project")

  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly")

  const weekStart = formatDateForWeek(getMonday(currentDate))
  const monthStr = formatDateForMonth(currentDate)

  const { data: timesheetData, isLoading: isTimesheetLoading } = useMyTimesheet(weekStart)
  const { data: monthlyOverviewData, isLoading: isMonthlyLoading } = useMyMonthlyOverview(monthStr)

  const filteredTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter((task) => {
      if (selectedProjectId && task.projectId !== selectedProjectId) return false
      if (selectedStatusId && task.statusId !== selectedStatusId) return false
      return true
    })
  }, [tasks, selectedProjectId, selectedStatusId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-[32px] font-bold">My Work</h1>
        <p className="text-muted-foreground">All tasks and time tracking across your projects.</p>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <Select value={groupBy} onValueChange={(value) => setGroupBy(value as "project" | "status")}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Group by project</SelectItem>
                <SelectItem value="status">Group by status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TaskFilters
            projects={projects}
            statuses={statuses ?? []}
            selectedProjectId={selectedProjectId}
            selectedStatusId={selectedStatusId}
            onProjectChange={setSelectedProjectId}
            onStatusChange={setSelectedStatusId}
          />

          {isTasksLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : filteredTasks.length === 0 ? (
            <EmptyState
              title="No tasks assigned"
              description="Once tasks are assigned to you, they will show up here."
            />
          ) : (
            <TaskGroupList
              tasks={filteredTasks}
              groupBy={groupBy}
              onSelect={(task) => navigate(`/projects/${task.projectId}/tasks`)}
            />
          )}
        </TabsContent>

        <TabsContent value="timesheet" className="mt-6">
          <div className="space-y-6">
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
                <div className="border rounded-lg">
                  <TimesheetGrid
                    entries={timesheetData.entries}
                    projects={projects}
                    weekStart={timesheetData.weekStart}
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
              <div className="border rounded-lg p-4">
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
