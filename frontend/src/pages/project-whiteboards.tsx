import { useState } from "react"
import { NewWhiteboardDialog } from "@/components/whiteboard/new-whiteboard-dialog"
import { WhiteboardCard } from "@/components/whiteboard/whiteboard-card"
import { Skeleton } from "@/components/ui/skeleton"
import { useWhiteboards } from "@/hooks/use-whiteboards"

interface ProjectWhiteboardsPageProps {
  projectId: string
}

export function ProjectWhiteboardsPage({ projectId }: ProjectWhiteboardsPageProps) {
  const { whiteboards, isLoading, createWhiteboard, deleteWhiteboard } = useWhiteboards(projectId)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Whiteboards</h2>
          <p className="text-sm text-muted-foreground">Sketch and brainstorm with your team.</p>
        </div>
        <NewWhiteboardDialog
          onCreate={(name) => createWhiteboard.mutateAsync({ name })}
        />
      </div>

      {whiteboards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          Create your first whiteboard to start sketching.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {whiteboards.map((whiteboard) => (
            <WhiteboardCard
              key={whiteboard.id}
              whiteboard={whiteboard}
              onDelete={async (id) => {
                setIsDeleting(id)
                await deleteWhiteboard.mutateAsync(id)
                setIsDeleting(null)
              }}
            />
          ))}
        </div>
      )}

      {isDeleting ? (
        <p className="text-xs text-muted-foreground">Deleting whiteboard...</p>
      ) : null}
    </div>
  )
}
