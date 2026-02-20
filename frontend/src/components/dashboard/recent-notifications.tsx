import { Link } from "react-router-dom"
import type { Notification } from "@/api/types"

interface RecentNotificationsProps {
  notifications: Notification[]
}

export function RecentNotifications({ notifications }: RecentNotificationsProps) {
  if (notifications.length === 0) {
    return <div className="text-sm text-muted-foreground">No recent notifications.</div>
  }

  return (
    <div className="divide-y divide-border/60">
      {notifications.map((notification) => (
        <div key={notification.id} className="flex gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              notification.read ? "bg-muted-foreground/30" : "bg-primary"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {notification.link ? (
                <Link to={notification.link} className="hover:underline">
                  {notification.title}
                </Link>
              ) : (
                notification.title
              )}
            </div>
            {notification.body && (
              <div className="line-clamp-2 text-xs text-muted-foreground">
                {notification.body}
              </div>
            )}
            <div className="mt-1 text-[11px] text-muted-foreground">
              {new Date(notification.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
