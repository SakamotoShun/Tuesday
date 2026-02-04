import type { Notification } from "@/api/types"

interface RecentNotificationsProps {
  notifications: Notification[]
}

export function RecentNotifications({ notifications }: RecentNotificationsProps) {
  if (notifications.length === 0) {
    return <div className="text-sm text-muted-foreground">No recent notifications.</div>
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <div key={notification.id} className="text-sm">
          <div className="font-medium">{notification.title}</div>
          {notification.body && (
            <div className="text-xs text-muted-foreground line-clamp-2">
              {notification.body}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
