import { Link } from "react-router-dom"
import { StatusBadge } from "@/components/projects/status-badge"

interface ProjectListCompactItem {
  id: string
  name: string
  statusName: string
  updatedAt: string
}

interface ProjectListCompactProps {
  projects: ProjectListCompactItem[]
}

function formatUpdated(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function ProjectListCompact({ projects }: ProjectListCompactProps) {
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects yet.</p>
  }

  return (
    <div className="divide-y divide-border/60">
      {projects.map((project) => (
        <div
          key={project.id}
          className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4"
        >
          <Link to={`/projects/${project.id}`} className="line-clamp-1 text-sm font-medium hover:underline">
            {project.name}
          </Link>
          <StatusBadge status={project.statusName} />
          <span className="text-xs text-muted-foreground md:justify-self-end md:text-sm">
            {formatUpdated(project.updatedAt)}
          </span>
        </div>
      ))}
    </div>
  )
}
