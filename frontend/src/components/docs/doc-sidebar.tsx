import { useState } from "react"
import { FileText, Plus } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { DocList, filterDocsByQuery } from "@/components/docs/doc-list"
import { DocSortControl } from "@/components/docs/doc-sort-control"
import { NewDocDialog } from "@/components/docs/new-doc-dialog"
import { useDocs } from "@/hooks/use-docs"
import { useDocSort } from "@/hooks/use-doc-sort"
import { useAuth } from "@/hooks/use-auth"
import { ApiErrorResponse } from "@/api/client"

interface DocSidebarProps {
  projectId: string | null
  activeDocId?: string
  width?: number
}

export function DocSidebar({ projectId, activeDocId, width = 260 }: DocSidebarProps) {
  const [query, setQuery] = useState("")
  const { user } = useAuth()
  const { docs, isLoading, error, createDoc, updateDoc, deleteDoc } = useDocs(projectId)
  const { sort, setSort } = useDocSort(projectId ? `workhub:doc-tree-sort:${projectId}` : "workhub:doc-tree-sort:personal")
  const isFreelancer = user?.role === "freelancer"

  const parentOptions = docs.filter((doc) => !doc.parentId)
  const filteredDocs = filterDocsByQuery(docs, query)

  return (
    <aside
      className="border-r border-border bg-background flex flex-col min-h-0"
      style={{ width, minWidth: width }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Docs
        </div>
        <div className="flex items-center gap-1">
          <DocSortControl value={sort} onChange={setSort} />
          {!isFreelancer && (
            <NewDocDialog
              projectId={projectId}
              parentOptions={parentOptions}
              onCreate={(data) => createDoc.mutateAsync(data)}
              isSubmitting={createDoc.isPending}
              trigger={(
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Create doc">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            />
          )}
        </div>
      </div>

      <div className="px-3 pb-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter docs"
          className="h-8 text-sm"
          aria-label="Filter docs"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {[...Array(8)].map((_, index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </div>
        ) : error ? (
          <Card className="p-3 text-xs text-destructive bg-destructive/10">
            {error instanceof ApiErrorResponse ? error.message : "Failed to load docs"}
          </Card>
        ) : docs.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No docs yet.</div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No docs match your search.</div>
        ) : (
          <DocList
            docs={filteredDocs}
            projectId={projectId}
            sortField={sort.field}
            sortDirection={sort.direction}
            activeDocId={activeDocId}
            onRename={(docId, title) => updateDoc.mutateAsync({ docId, data: { title } })}
            onDelete={(docId) => deleteDoc.mutateAsync(docId)}
            canManage={!isFreelancer}
          />
        )}
      </div>
    </aside>
  )
}
