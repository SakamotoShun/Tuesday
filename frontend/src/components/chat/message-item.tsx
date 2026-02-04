import type { Message } from "@/api/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface MessageItemProps {
  message: Message
  isOwn?: boolean
}

const highlightMentions = (content: string) => {
  const parts = content.split(/(@[a-zA-Z0-9._-]+)/g)
  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      return (
        <span key={`${part}-${index}`} className="text-primary font-semibold">
          {part}
        </span>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

export function MessageItem({ message, isOwn }: MessageItemProps) {
  const name = message.user?.name ?? "Unknown"
  const timestamp = new Date(message.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <div className={cn("flex gap-3", isOwn && "opacity-95")}>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs bg-muted">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          <span className="text-xs text-muted-foreground">{timestamp}</span>
        </div>
        <div className="text-sm text-foreground leading-relaxed">
          {highlightMentions(message.content)}
        </div>
      </div>
    </div>
  )
}
