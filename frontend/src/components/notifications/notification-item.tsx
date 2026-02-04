import { Bell, Calendar, CheckCircle, MessageCircle, UserPlus } from "lucide-react"
import type { Notification } from "@/api/types"
import { cn } from "@/lib/utils"

const iconMap = {
  mention: MessageCircle,
  assignment: CheckCircle,
  meeting_invite: Calendar,
  project_invite: UserPlus,
} as const

interface NotificationItemProps {
  notification: Notification
  onClick?: () => void
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const Icon = iconMap[notification.type] ?? Bell
  const timestamp = new Date(notification.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <button
      className={cn(
        "w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors",
        !notification.read && "bg-muted/40"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">{notification.title}</div>
          {notification.body && (
            <div className="text-xs text-muted-foreground line-clamp-2">
              {notification.body}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground mt-1">{timestamp}</div>
        </div>
      </div>
    </button>
  )
}
