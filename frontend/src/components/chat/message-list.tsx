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
  currentUserRole?: "admin" | "member"
  onUpdateMessage?: (messageId: string, content: string) => Promise<unknown>
  onDeleteMessage?: (messageId: string) => Promise<unknown>
  onAddReaction?: (messageId: string, emoji: string) => Promise<unknown>
  onRemoveReaction?: (messageId: string, emoji: string) => Promise<unknown>
}

export function MessageList({
  messages,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  currentUserId,
  currentUserRole,
  onUpdateMessage,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
}: MessageListProps) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading messages...</div>
  }

  if (messages.length === 0) {
    return <div className="text-sm text-muted-foreground">No messages yet.</div>
  }

  return (
    <div className="space-y-3">
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
        <MessageItem
          key={message.id}
          message={message}
          isOwn={message.userId === currentUserId}
          canEdit={message.userId === currentUserId || currentUserRole === "admin"}
          canDelete={message.userId === currentUserId || currentUserRole === "admin"}
          currentUserId={currentUserId}
          onUpdate={
            onUpdateMessage
              ? (content) => onUpdateMessage(message.id, content)
              : undefined
          }
          onDelete={
            onDeleteMessage
              ? () => onDeleteMessage(message.id)
              : undefined
          }
          onAddReaction={
            onAddReaction
              ? (emoji: string) => onAddReaction(message.id, emoji)
              : undefined
          }
          onRemoveReaction={
            onRemoveReaction
              ? (emoji: string) => onRemoveReaction(message.id, emoji)
              : undefined
          }
        />
      ))}
    </div>
  )
}
