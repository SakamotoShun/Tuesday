import { Link } from "react-router-dom"
import type { Project } from "@/api/types"

interface QuickLinksProps {
  projects: Project[]
}

export function QuickLinks({ projects }: QuickLinksProps) {
  if (projects.length === 0) {
    return <div className="text-sm text-muted-foreground">No projects yet.</div>
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => (
        <Link
          key={project.id}
          to={`/projects/${project.id}`}
          className="block text-sm text-primary hover:underline"
        >
          {project.name}
        </Link>
      ))}
    </div>
  )
}
