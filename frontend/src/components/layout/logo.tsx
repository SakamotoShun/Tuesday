import { cn } from "@/lib/utils"

interface LogoProps {
  collapsed?: boolean
  className?: string
}

export function Logo({ collapsed = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm">
        T
      </div>
      {!collapsed && (
        <span className="font-bold text-lg text-foreground">Tuesday</span>
      )}
    </div>
  )
}
