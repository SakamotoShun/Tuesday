import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, ChevronRight, FileText, Folder, Table } from "lucide-react"
import type { Doc } from "@/api/types"
import { useDocs } from "@/hooks/use-docs"

interface ProjectDocsDropdownProps {
  projectId: string
}

interface ProjectDocTreeItemProps {
  doc: Doc
  projectId: string
  level: number
  childrenByParent: Map<string, Doc[]>
}

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

function compareDocsByTitle(first: Doc, second: Doc) {
  const titleComparison = titleCollator.compare(first.title, second.title)
  if (titleComparison !== 0) return titleComparison
  return first.id.localeCompare(second.id)
}

function ProjectDocTreeItem({
  doc,
  projectId,
  level,
  childrenByParent,
}: ProjectDocTreeItemProps) {
  const children = childrenByParent.get(doc.id) ?? []
  const hasChildren = children.length > 0
  const [isExpanded, setIsExpanded] = useState(hasChildren)
  const Icon = doc.isDatabase ? Table : hasChildren ? Folder : FileText

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
        style={{ paddingLeft: `${6 + level * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
            aria-label={isExpanded ? "Collapse sub-documents" : "Expand sub-documents"}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Link
          to={`/projects/${projectId}/docs/${doc.id}`}
          className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
        >
          {doc.title}
        </Link>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <ProjectDocTreeItem
              key={child.id}
              doc={child}
              projectId={projectId}
              level={level + 1}
              childrenByParent={childrenByParent}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ProjectDocsDropdown({ projectId }: ProjectDocsDropdownProps) {
  const { docs, isLoading, error } = useDocs(projectId)

  const childrenByParent = new Map<string, Doc[]>()
  docs.forEach((doc) => {
    if (!doc.parentId) return
    const existing = childrenByParent.get(doc.parentId)
    if (existing) {
      existing.push(doc)
      return
    }
    childrenByParent.set(doc.parentId, [doc])
  })

  const docIds = new Set(docs.map((doc) => doc.id))
  const rootDocs = docs
    .filter((doc) => !doc.parentId || !docIds.has(doc.parentId))
    .slice()
    .sort(compareDocsByTitle)

  childrenByParent.forEach((children, parentId) => {
    childrenByParent.set(parentId, children.slice().sort(compareDocsByTitle))
  })

  return (
    <div className="mt-2 ml-6 rounded-md border border-border/60 bg-muted/20 p-1.5">
      {isLoading ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">Loading docs...</p>
      ) : error ? (
        <p className="px-2 py-1 text-xs text-destructive">Could not load docs.</p>
      ) : rootDocs.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">No docs in this project.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          {rootDocs.map((doc) => (
            <ProjectDocTreeItem key={doc.id} doc={doc} projectId={projectId} level={0} childrenByParent={childrenByParent} />
          ))}
        </div>
      )}
    </div>
  )
}
