import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="p-8 border border-dashed border-border rounded-lg text-center">
      <div className="text-lg font-semibold mb-2">{title}</div>
      {description && <div className="text-sm text-muted-foreground mb-4">{description}</div>}
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
