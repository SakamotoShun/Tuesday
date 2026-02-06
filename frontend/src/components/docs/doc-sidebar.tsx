import { FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DocList } from "@/components/docs/doc-list"
import { NewDocDialog } from "@/components/docs/new-doc-dialog"
import { useDocs } from "@/hooks/use-docs"
import { ApiErrorResponse } from "@/api/client"

interface DocSidebarProps {
  projectId: string
  activeDocId?: string
}

export function DocSidebar({ projectId, activeDocId }: DocSidebarProps) {
  const { docs, isLoading, error, createDoc, updateDoc, deleteDoc } = useDocs(projectId)

  const parentOptions = docs.filter((doc) => !doc.parentId)

  return (
    <aside className="w-[260px] min-w-[260px] border-r border-border bg-background flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Docs
        </div>
        <NewDocDialog
          parentOptions={parentOptions}
          onCreate={(data) => createDoc.mutateAsync(data)}
          isSubmitting={createDoc.isPending}
          trigger={(
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Create doc">
              <Plus className="h-4 w-4" />
            </Button>
          )}
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
        ) : (
          <DocList
            docs={docs}
            projectId={projectId}
            activeDocId={activeDocId}
            onRename={(docId, title) => updateDoc.mutateAsync({ docId, data: { title } })}
            onDelete={(docId) => deleteDoc.mutateAsync(docId)}
          />
        )}
      </div>
    </aside>
  )
}
