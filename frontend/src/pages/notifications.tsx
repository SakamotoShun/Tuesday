import { useNavigate } from "react-router-dom"
import { useNotifications } from "@/hooks/use-notifications"
import { NotificationItem } from "@/components/notifications/notification-item"
import { Button } from "@/components/ui/button"

export function NotificationsPage() {
  const navigate = useNavigate()
  const { notifications, isLoading, error, refetch, markRead, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications()

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-[32px] font-bold">Notifications</h1>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading notifications...</div>
      ) : error ? (
        <div role="alert" className="space-y-3 text-sm text-destructive">
          <div>Unable to load notifications.</div>
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-sm text-muted-foreground">You are all caught up.</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClick={() => {
                if (!notification.read) {
                  markRead.mutate(notification.id)
                }
                if (notification.link) {
                  navigate(notification.link)
                }
              }}
            />
          ))}
          {hasNextPage && (
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
