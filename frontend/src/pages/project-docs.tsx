import { FileText } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DocList } from "@/components/docs/doc-list"
import { NewDocDialog } from "@/components/docs/new-doc-dialog"
import { useDocs } from "@/hooks/use-docs"
import { ApiErrorResponse } from "@/api/client"

interface ProjectDocsPageProps {
  projectId: string
}

export function ProjectDocsPage({ projectId }: ProjectDocsPageProps) {
  const { docs, isLoading, error, createDoc, updateDoc, deleteDoc } = useDocs(projectId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Card className="p-4 space-y-3">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </Card>
      </div>
    )
  }

  if (error) {
    const message = error instanceof ApiErrorResponse ? error.message : "Failed to load docs"
    return (
      <Card className="p-6 text-sm text-destructive bg-destructive/10">
        {message}
      </Card>
    )
  }

  const parentOptions = docs.filter((doc) => !doc.parentId)

  const docLabel = docs.length === 1 ? "doc" : "docs"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{docs.length} {docLabel}</span>
        </div>
        <NewDocDialog
          parentOptions={parentOptions}
          onCreate={(data) => createDoc.mutateAsync(data)}
          isSubmitting={createDoc.isPending}
        />
      </div>

      <Card className="p-4">
        {docs.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <p>No docs yet</p>
            <p className="text-sm">Create your first doc to start organizing your project.</p>
          </div>
        ) : (
          <DocList
            docs={docs}
            projectId={projectId}
            onRename={(docId, title) => updateDoc.mutateAsync({ docId, data: { title } })}
            onDelete={(docId) => deleteDoc.mutateAsync(docId)}
          />
        )}
      </Card>
    </div>
  )
}
