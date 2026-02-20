import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, ChevronRight } from "lucide-react"
import { ProjectDocsDropdown } from "@/components/dashboard/project-docs-dropdown"
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
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())

  const toggleProjectDocs = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects yet.</p>
  }

  return (
    <div className="divide-y divide-border/60">
      {projects.map((project) => {
        const isExpanded = expandedProjectIds.has(project.id)

        return (
          <div key={project.id} className="py-3 first:pt-0 last:pb-0">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center md:gap-4">
              <button
                type="button"
                className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground md:mt-0"
                aria-label={isExpanded ? `Collapse docs for ${project.name}` : `Expand docs for ${project.name}`}
                aria-expanded={isExpanded}
                onClick={() => toggleProjectDocs(project.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              <Link to={`/projects/${project.id}`} className="line-clamp-1 text-sm font-medium hover:underline">
                {project.name}
              </Link>
              <div className="col-start-2 w-fit md:col-start-3">
                <StatusBadge status={project.statusName} />
              </div>
              <span className="col-start-2 text-xs text-muted-foreground md:col-start-4 md:justify-self-end md:text-sm">
                {formatUpdated(project.updatedAt)}
              </span>
            </div>
            {isExpanded && <ProjectDocsDropdown projectId={project.id} />}
          </div>
        )
      })}
    </div>
  )
}
