import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Logo } from "./logo"
import { UserMenu } from "./user-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"

export function TopBar() {
  return (
    <header className="h-[72px] bg-card border-b border-border flex items-center px-6 gap-6 shrink-0">
      <Logo />

      <div className="flex-1 max-w-[400px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects, docs, tasks..."
            className="pl-9 bg-background border-border"
            disabled
          />
        </div>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <NotificationBell />

        <UserMenu />
      </div>
    </header>
  )
}
