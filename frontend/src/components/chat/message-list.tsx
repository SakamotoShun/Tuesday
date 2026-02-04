import type { Message } from "@/api/types"
import { Button } from "@/components/ui/button"
import { MessageItem } from "@/components/chat/message-item"

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  onLoadMore?: () => void
  currentUserId?: string
}

export function MessageList({
  messages,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  currentUserId,
}: MessageListProps) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading messages...</div>
  }

  if (messages.length === 0) {
    return <div className="text-sm text-muted-foreground">No messages yet.</div>
  }

  return (
    <div className="space-y-4">
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load older messages"}
          </Button>
        </div>
      )}
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} isOwn={message.userId === currentUserId} />
      ))}
    </div>
  )
}
