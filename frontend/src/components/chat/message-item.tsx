import { useEffect, useState } from "react"
import type { Message } from "@/api/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { AttachmentList } from "@/components/chat/attachment-list"
import { DeleteMessageDialog } from "@/components/chat/delete-message-dialog"
import { EmojiPickerDialog } from "@/components/chat/emoji-picker-dialog"
import { EditMessageForm } from "@/components/chat/edit-message-form"
import { MarkdownContent } from "@/components/chat/markdown-content"
import { MessageActions } from "@/components/chat/message-actions"
import { ReactionBar } from "@/components/chat/reaction-bar"
import { cn } from "@/lib/utils"

interface MessageItemProps {
  message: Message
  isOwn?: boolean
  canEdit?: boolean
  canDelete?: boolean
  currentUserId?: string
  onUpdate?: (content: string) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onAddReaction?: (emoji: string) => Promise<unknown>
  onRemoveReaction?: (emoji: string) => Promise<unknown>
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

export function MessageItem({
  message,
  isOwn,
  canEdit,
  canDelete,
  currentUserId,
  onUpdate,
  onDelete,
  onAddReaction,
  onRemoveReaction,
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isBotMessage = Boolean(message.botId && message.bot)
  const name = isBotMessage ? message.bot?.name ?? "Bot" : message.user?.name ?? "Unknown"
  const avatarUrl = isBotMessage ? message.bot?.avatarUrl ?? undefined : message.user?.avatarUrl ?? undefined
  const timestamp = new Date(message.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  const isDeleted = Boolean(message.deletedAt)
  const isMentioned = Boolean(currentUserId && message.mentions?.includes(currentUserId) && !isDeleted)
  const hasContent = message.content.trim().length > 0

  const canEditMessage = Boolean(!isDeleted && (canEdit ?? false) && onUpdate)
  const canDeleteMessage = Boolean(!isDeleted && (canDelete ?? false) && onDelete)
  const canReact = Boolean(!isDeleted && onAddReaction && onRemoveReaction)

  useEffect(() => {
    if (isDeleted && isEditing) {
      setIsEditing(false)
    }
  }, [isDeleted, isEditing])

  const handleSave = async (content: string) => {
    if (!onUpdate || !content) return
    setIsSaving(true)
    setEditError(null)
    try {
      await onUpdate(content)
      setIsEditing(false)
    } catch (err) {
      if (err instanceof Error) {
        setEditError(err.message)
      } else {
        setEditError("Failed to update message")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    await onDelete()
  }

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-md px-2 py-1",
        isOwn && "opacity-95",
        isMentioned && "bg-primary/5"
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={avatarUrl} alt={name} />
        <AvatarFallback className="text-xs bg-muted">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{name}</span>
            {isBotMessage && <Badge variant="secondary" className="text-[10px] px-2 py-0">BOT</Badge>}
            <span className="text-xs text-muted-foreground">{timestamp}</span>
            {message.editedAt && !isDeleted && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}
          </div>
          {!isDeleted && !isEditing && (canEditMessage || canDeleteMessage || canReact) && (
            <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
              {canReact && (
                <EmojiPickerDialog
                  onSelect={(emoji) => {
                    onAddReaction?.(emoji)
                  }}
                />
              )}
              <MessageActions
                canEdit={canEditMessage}
                canDelete={canDeleteMessage}
                onEdit={() => {
                  setEditError(null)
                  setIsEditing(true)
                }}
                onDelete={() => setDeleteOpen(true)}
              />
            </div>
          )}
        </div>
        {isEditing ? (
          <EditMessageForm
            initialValue={message.content}
            isSaving={isSaving}
            error={editError}
            onCancel={() => {
              setIsEditing(false)
              setEditError(null)
            }}
            onSave={handleSave}
          />
        ) : isDeleted ? (
          <div className="text-sm text-muted-foreground italic">This message was deleted.</div>
        ) : hasContent ? (
          <MarkdownContent content={message.content} />
        ) : null}
        {!isDeleted && message.attachments && message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} />
        )}
        {!isDeleted && message.reactions && message.reactions.length > 0 && (
          <ReactionBar
            reactions={message.reactions}
            currentUserId={currentUserId}
            onToggle={(emoji, hasReacted) => {
              if (hasReacted) {
                onRemoveReaction?.(emoji)
              } else {
                onAddReaction?.(emoji)
              }
            }}
          />
        )}
      </div>
      {onDelete && (
        <DeleteMessageDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
