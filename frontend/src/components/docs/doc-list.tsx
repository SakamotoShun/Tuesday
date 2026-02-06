import type { Doc } from "@/api/types"
import type { DocSortDirection, DocSortField } from "@/components/docs/doc-sorting"
import { DocTreeItem } from "@/components/docs/doc-tree-item"

interface DocListProps {
  docs: Doc[]
  projectId: string
  sortField: DocSortField
  sortDirection: DocSortDirection
  activeDocId?: string
  onRename: (docId: string, title: string) => Promise<unknown>
  onDelete: (docId: string) => Promise<unknown>
}

function compareDates(first: string, second: string) {
  return new Date(first).getTime() - new Date(second).getTime()
}

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

function createDocComparator(sortField: DocSortField, sortDirection: DocSortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1

  return (first: Doc, second: Doc) => {
    let comparison = 0

    if (sortField === "title") {
      comparison = titleCollator.compare(first.title, second.title)
    }

    if (sortField === "createdAt") {
      comparison = compareDates(first.createdAt, second.createdAt)
    }

    if (sortField === "updatedAt") {
      comparison = compareDates(first.updatedAt, second.updatedAt)
    }

    if (comparison === 0) {
      comparison = titleCollator.compare(first.title, second.title)
    }

    if (comparison === 0) {
      comparison = compareDates(first.createdAt, second.createdAt)
    }

    if (comparison === 0) {
      comparison = first.id.localeCompare(second.id)
    }

    return comparison * direction
  }
}

export function DocList({
  docs,
  projectId,
  sortField,
  sortDirection,
  activeDocId,
  onRename,
  onDelete,
}: DocListProps) {
  const childrenByParent = new Map<string, Doc[]>()
  const compareDocs = createDocComparator(sortField, sortDirection)

  docs.forEach((doc) => {
    if (!doc.parentId) return
    const existing = childrenByParent.get(doc.parentId)
    if (existing) {
      existing.push(doc)
    } else {
      childrenByParent.set(doc.parentId, [doc])
    }
  })

  const docIds = new Set(docs.map((doc) => doc.id))
  const rootDocs = docs
    .filter((doc) => !doc.parentId || !docIds.has(doc.parentId))
    .slice()
    .sort(compareDocs)

  const sortedChildrenByParent = new Map<string, Doc[]>()

  childrenByParent.forEach((children, parentId) => {
    sortedChildrenByParent.set(parentId, children.slice().sort(compareDocs))
  })

  return (
    <div>
      {rootDocs.map((doc) => (
        <DocTreeItem
          key={doc.id}
          doc={doc}
          projectId={projectId}
          children={sortedChildrenByParent.get(doc.id) ?? []}
          childrenByParent={sortedChildrenByParent}
          activeDocId={activeDocId}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
