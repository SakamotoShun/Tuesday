import { Button } from "@/components/ui/button"

interface ErrorDisplayProps {
  title?: string
  message?: string
  onRetry?: () => void
  requestId?: string | null
  retryLabel?: string
}

export function ErrorDisplay({
  title = "Something went wrong",
  message,
  onRetry,
  requestId,
  retryLabel = "Retry",
}: ErrorDisplayProps) {
  return (
    <div className="p-6 border border-destructive/40 bg-destructive/10 rounded-lg">
      <div className="text-sm font-semibold text-destructive mb-1">{title}</div>
      {message && <div className="text-sm text-destructive/80 mb-4">{message}</div>}
      {requestId && (
        <div className="mb-4 rounded border border-destructive/20 bg-background/60 px-3 py-2 font-mono text-xs text-destructive/80">
          Request ID: {requestId}
        </div>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
