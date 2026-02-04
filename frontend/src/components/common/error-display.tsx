import { Button } from "@/components/ui/button"

interface ErrorDisplayProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorDisplay({ title = "Something went wrong", message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="p-6 border border-destructive/40 bg-destructive/10 rounded-lg">
      <div className="text-sm font-semibold text-destructive mb-1">{title}</div>
      {message && <div className="text-sm text-destructive/80 mb-4">{message}</div>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
