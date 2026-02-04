import { Link } from "react-router-dom"
import type { Notification } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { NotificationItem } from "@/components/notifications/notification-item"

interface NotificationPanelProps {
  notifications: Notification[]
  onMarkAllRead: () => void
  onSelect: (notification: Notification) => void
}

export function NotificationPanel({ notifications, onMarkAllRead, onSelect }: NotificationPanelProps) {
  return (
    <div className="w-80">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-semibold">Notifications</div>
        <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
          Mark all read
        </Button>
      </div>
      <Separator />
      <div className="max-h-72 overflow-y-auto p-2 space-y-1">
        {notifications.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-4">No notifications yet.</div>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClick={() => onSelect(notification)}
            />
          ))
        )}
      </div>
      <Separator />
      <div className="px-3 py-2">
        <Link to="/notifications" className="text-sm text-primary hover:underline">
          View all notifications
        </Link>
      </div>
    </div>
  )
}
