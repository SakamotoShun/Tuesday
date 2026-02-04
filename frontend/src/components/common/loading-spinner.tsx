import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  className?: string
}

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent",
        className
      )}
    />
  )
}
