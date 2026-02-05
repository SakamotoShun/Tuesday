import { useNavigate } from "react-router-dom"
import { Bell } from "lucide-react"
import { useNotifications } from "@/hooks/use-notifications"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu"
import { NotificationPanel } from "@/components/notifications/notification-panel"

export function NotificationBell() {
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 max-w-[calc(100vw-16px)] p-0">
        <NotificationPanel
          notifications={notifications}
          onMarkAllRead={() => markAllRead.mutate()}
          onSelect={(notification) => {
            if (!notification.read) {
              markRead.mutate(notification.id)
            }
            if (notification.link) {
              navigate(notification.link)
            }
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
