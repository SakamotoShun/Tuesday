import type { HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { GripVertical, X } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface WidgetShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>
  onHide: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  className?: string
  bodyClassName?: string
}

export function WidgetShell({
  title,
  subtitle,
  children,
  dragHandleProps,
  onHide,
  onResizeStart,
  className,
  bodyClassName,
}: WidgetShellProps) {
  return (
    <section className={cn("relative flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 md:px-4">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-semibold md:text-base">{title}</h3>
          {subtitle && <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Drag widget"
            title="Drag widget"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground"
            onClick={onHide}
            aria-label="Hide widget"
            title="Hide widget"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className={cn("min-h-0 flex-1 overflow-y-auto p-3 md:p-4", bodyClassName)}>{children}</div>

      <button
        type="button"
        className="absolute bottom-1.5 right-1.5 flex h-6 w-6 cursor-se-resize items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onPointerDown={onResizeStart}
        aria-label="Resize widget"
        title="Resize widget"
      >
        <span className="relative h-3.5 w-3.5">
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-current" />
          <span className="absolute bottom-[3px] right-[3px] h-1.5 w-1.5 border-b border-r border-current" />
        </span>
      </button>
    </section>
  )
}
