import { cn } from "@/lib/utils"

interface LogoProps {
  collapsed?: boolean
  className?: string
}

export function Logo({ collapsed = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img 
        src="/Tuesday.png" 
        alt="Tuesday" 
        className="w-8 h-8 rounded-lg object-cover"
      />
      {!collapsed && (
        <span className="font-bold text-lg text-foreground">Tuesday</span>
      )}
    </div>
  )
}
