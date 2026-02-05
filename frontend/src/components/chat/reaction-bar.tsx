import type { MessageReaction } from "@/api/types"
import { cn } from "@/lib/utils"

interface ReactionBarProps {
  reactions?: MessageReaction[]
  currentUserId?: string
  onToggle?: (emoji: string, hasReacted: boolean) => void
}

interface ReactionGroup {
  emoji: string
  count: number
  reacted: boolean
}

const groupReactions = (reactions: MessageReaction[], currentUserId?: string) => {
  const map = new Map<string, ReactionGroup>()
  for (const reaction of reactions) {
    const existing = map.get(reaction.emoji)
    if (existing) {
      existing.count += 1
      if (reaction.userId === currentUserId) {
        existing.reacted = true
      }
    } else {
      map.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reacted: reaction.userId === currentUserId,
      })
    }
  }
  return Array.from(map.values())
}

export function ReactionBar({ reactions = [], currentUserId, onToggle }: ReactionBarProps) {
  if (reactions.length === 0) return null

  const grouped = groupReactions(reactions, currentUserId)

  return (
    <div className="flex flex-wrap gap-2">
      {grouped.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => onToggle?.(reaction.emoji, reaction.reacted)}
          disabled={!onToggle}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs transition",
            reaction.reacted ? "bg-primary/10 text-primary border-primary/30" : "hover:bg-muted"
          )}
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
    </div>
  )
}
