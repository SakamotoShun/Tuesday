import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusBadge } from "./status-badge"
import type { Project } from "@/api/types"

interface ProjectRowProps {
  project: Project
}

export function ProjectRow({ project }: ProjectRowProps) {
  const navigate = useNavigate()

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "—"
    const startStr = start ? formatDate(start) : "TBD"
    const endStr = end ? formatDate(end) : "Ongoing"
    return `${startStr} → ${endStr}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className={cn(
        "flex items-center px-4 py-3.5 border-b border-border gap-4 hover:bg-muted/30 cursor-pointer rounded-lg transition-colors"
      )}
    >
      <div className="flex-[2] min-w-0">
        <div className="font-semibold truncate">{project.name}</div>
        <div className="text-sm text-muted-foreground">
          {project.client || "Internal"}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <StatusBadge status={project.status?.name} />
        {project.type && (
          <Badge variant="secondary" className="shrink-0">
            {project.type}
          </Badge>
        )}
      </div>
      <div className="flex -space-x-2 shrink-0">
        {project.members?.slice(0, 3).map((member) => (
          <Avatar
            key={member.userId}
            className="h-7 w-7 border-2 border-background"
          >
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(member.user?.name || "U")}
            </AvatarFallback>
          </Avatar>
        ))}
        {project.members && project.members.length > 3 && (
          <Avatar className="h-7 w-7 border-2 border-background">
            <AvatarFallback className="bg-muted text-xs">
              +{project.members.length - 3}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
        {formatDateRange(project.startDate, project.targetEndDate)}
      </div>
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
