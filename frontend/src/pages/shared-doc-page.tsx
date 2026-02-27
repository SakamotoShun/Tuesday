import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "@/lib/icons"
import { docsApi } from "@/api/docs"
import { ApiErrorResponse } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SimpleBlockNoteEditor } from "@/components/hiring/simple-block-note-editor"

export function SharedDocPage() {
  const { token } = useParams<{ token: string }>()

  const sharedDocQuery = useQuery({
    queryKey: ["shared-doc", token],
    queryFn: () => docsApi.getSharedDoc(token ?? ""),
    enabled: !!token,
  })

  if (sharedDocQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (sharedDocQuery.error || !sharedDocQuery.data) {
    const message = sharedDocQuery.error instanceof ApiErrorResponse
      ? sharedDocQuery.error.message
      : "This shared doc is unavailable"

    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <Card className="space-y-3 p-6">
          <h1 className="text-xl font-semibold">Unable to open shared doc</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild variant="outline">
            <Link to="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go to login
            </Link>
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared doc</p>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-serif font-bold">{sharedDocQuery.data.doc.title}</h1>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">View only</span>
        </div>
      </div>

      <SimpleBlockNoteEditor initialContent={sharedDocQuery.data.doc.content} editable={false} />
    </div>
  )
}
