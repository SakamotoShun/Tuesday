import { useMemo } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useMyTasks } from "@/hooks/use-tasks"
import { useMyMeetings } from "@/hooks/use-meetings"
import { useProjects } from "@/hooks/use-projects"
import { useNotifications } from "@/hooks/use-notifications"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TasksDueSoon } from "@/components/dashboard/tasks-due-soon"
import { UpcomingMeetings } from "@/components/dashboard/upcoming-meetings"
import { RecentNotifications } from "@/components/dashboard/recent-notifications"
import { QuickLinks } from "@/components/dashboard/quick-links"

export function HomePage() {
  const { user } = useAuth()
  const { data: tasks } = useMyTasks()
  const { data: meetings } = useMyMeetings()
  const { projects } = useProjects()
  const { notifications } = useNotifications()

  const tasksDueSoon = useMemo(() => {
    const now = new Date()
    const week = new Date()
    week.setDate(now.getDate() + 7)
    return (tasks ?? [])
      .filter((task) => task.dueDate && new Date(task.dueDate) <= week)
      .sort((a, b) => new Date(a.dueDate ?? "").getTime() - new Date(b.dueDate ?? "").getTime())
      .slice(0, 5)
  }, [tasks])

  const upcomingMeetings = useMemo(() => {
    const now = new Date()
    const week = new Date()
    week.setDate(now.getDate() + 7)
    return (meetings ?? [])
      .filter((meeting) => new Date(meeting.startTime) >= now && new Date(meeting.startTime) <= week)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 5)
  }, [meetings])

  const recentNotifications = useMemo(() => notifications.slice(0, 5), [notifications])
  const quickLinks = useMemo(() => projects.slice(0, 5), [projects])

  return (
    <div>
      <h1 className="font-serif text-[32px] font-bold mb-6">
        Good {getTimeOfDay()}, {user?.name?.split(" ")[0] ?? "there"}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentNotifications notifications={recentNotifications} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks Due Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <TasksDueSoon tasks={tasksDueSoon} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <UpcomingMeetings meetings={upcomingMeetings} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent>
            <QuickLinks projects={quickLinks} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}
