import { Link, useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useProject } from "@/hooks/use-projects"
import { StatusBadge } from "@/components/projects/status-badge"

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading } = useProject(id || "")

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
        <Button onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Button>
      </div>
    )
  }

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "—"
    const startStr = start
      ? new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "TBD"
    const endStr = end
      ? new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Ongoing"
    return `${startStr} → ${endStr}`
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/projects" className="hover:text-foreground">
          Projects
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{project.name}</span>
      </div>

      {/* Project Header Card */}
      <Card className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="font-serif text-[28px] font-bold mb-2">
              {project.name}
            </h1>
            <p className="text-muted-foreground">
              {project.client || "Internal Project"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={project.status?.name} />
            <Button variant="outline">Manage Members</Button>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-8">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Owners
            </div>
            <div className="flex -space-x-2">
              {project.members
                ?.filter((m) => m.role === "owner")
                .map((member) => (
                  <Avatar
                    key={member.userId}
                    className="h-8 w-8 border-2 border-card"
                  >
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {getInitials(member.user?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Timeline
            </div>
            <div className="font-semibold text-sm">
              {formatDateRange(project.startDate, project.targetEndDate)}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Type
            </div>
            <div className="font-semibold text-sm">
              {project.type || "Not specified"}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Members
            </div>
            <div className="font-semibold text-sm">
              {project.members?.length || 0} people
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="whiteboards">Whiteboards</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="mt-6">
          <PlaceholderContent title="Docs" phase="Phase 4" />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <PlaceholderContent title="Tasks" phase="Phase 4" />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <PlaceholderContent title="Timeline" phase="Phase 4" />
        </TabsContent>

        <TabsContent value="schedule" className="mt-6">
          <PlaceholderContent title="Schedule" phase="Phase 4" />
        </TabsContent>

        <TabsContent value="whiteboards" className="mt-6">
          <PlaceholderContent title="Whiteboards" phase="Phase 4" />
        </TabsContent>

        <TabsContent value="chat" className="mt-6">
          <PlaceholderContent title="Chat" phase="Phase 5" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PlaceholderContent({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="p-12 text-center border border-dashed border-border rounded-lg">
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground">
        Coming in {phase}
      </p>
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
