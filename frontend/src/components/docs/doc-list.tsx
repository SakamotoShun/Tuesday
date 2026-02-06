import type { Doc } from "@/api/types"
import { DocTreeItem } from "@/components/docs/doc-tree-item"

interface DocListProps {
  docs: Doc[]
  projectId: string
  activeDocId?: string
  onRename: (docId: string, title: string) => Promise<unknown>
  onDelete: (docId: string) => Promise<unknown>
}

export function DocList({ docs, projectId, activeDocId, onRename, onDelete }: DocListProps) {
  const childrenByParent = new Map<string, Doc[]>()

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
  const rootDocs = docs.filter((doc) => !doc.parentId || !docIds.has(doc.parentId))

  return (
    <div>
      {rootDocs.map((doc) => (
        <DocTreeItem
          key={doc.id}
          doc={doc}
          projectId={projectId}
          children={childrenByParent.get(doc.id) ?? []}
          childrenByParent={childrenByParent}
          activeDocId={activeDocId}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
