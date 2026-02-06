import type { ChannelBot, User } from "@/api/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type MentionOption =
  | { type: "user"; user: User }
  | { type: "bot"; bot: ChannelBot }
  | { type: "special"; key: string; label: string; description: string }

interface MentionAutocompleteProps {
  options: MentionOption[]
  visible: boolean
  activeIndex: number
  onSelect: (option: MentionOption) => void
  onHover: (index: number) => void
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

export function MentionAutocomplete({
  options,
  visible,
  activeIndex,
  onSelect,
  onHover,
}: MentionAutocompleteProps) {
  if (!visible || options.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 z-10 mb-2 rounded-md border border-border bg-card shadow-md">
      {options.map((option, index) => (
        <button
          key={option.type === "user" ? option.user.id : option.type === "bot" ? option.bot.id : (option as { key: string }).key}
          type="button"
          className={cn(
            "w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2",
            index === activeIndex && "bg-muted"
          )}
          onClick={() => onSelect(option)}
          onMouseEnter={() => onHover(index)}
        >
          {option.type === "user" ? (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px] bg-muted">{getInitials(option.user.name)}</AvatarFallback>
            </Avatar>
          ) : option.type === "bot" ? (
            <Avatar className="h-6 w-6">
              <AvatarImage src={option.bot.avatarUrl ?? undefined} alt={option.bot.name} />
              <AvatarFallback className="text-[10px] bg-muted">{getInitials(option.bot.name)}</AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
              @
            </div>
          )}
          <div className="flex-1">
            <div className="font-medium flex items-center gap-1.5">
              {option.type === "user" ? option.user.name : option.type === "bot" ? option.bot.name : (option as { label: string }).label}
              {option.type === "bot" && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 leading-tight">
                  {option.bot.type === "ai" ? "AI" : "BOT"}
                </Badge>
              )}
            </div>
            {option.type === "special" && (
              <div className="text-xs text-muted-foreground">{option.description}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
