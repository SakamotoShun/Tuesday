import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface RailItemProps {
  icon: LucideIcon
  label: string
  href: string
}

export function RailItem({ icon: Icon, label, href }: RailItemProps) {
  const location = useLocation()
  const isActive =
    location.pathname === href || location.pathname.startsWith(`${href}/`)

  return (
    <Link
      to={href}
      className={cn(
        "w-[60px] h-[60px] rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground text-[11px] font-medium transition-colors",
        isActive && "bg-primary-light text-primary",
        !isActive && "hover:bg-muted"
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  )
}
