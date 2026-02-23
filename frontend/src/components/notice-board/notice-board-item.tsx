import { Megaphone, Pencil, Square, CheckSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { NoticeBoardItem } from "@/api/types"

interface NoticeBoardItemRowProps {
  item: NoticeBoardItem
  canManage: boolean
  onToggle: (id: string) => void
  onEdit: (item: NoticeBoardItem) => void
}

export function NoticeBoardItemRow({ item, canManage, onToggle, onEdit }: NoticeBoardItemRowProps) {
  const isTodo = item.type === "todo"

  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <div className="flex items-start gap-2">
        {isTodo ? (
          <button
            type="button"
            onClick={() => onToggle(item.id)}
            className="mt-0.5 text-muted-foreground hover:text-foreground"
            aria-label={item.isCompleted ? "Mark todo incomplete" : "Mark todo complete"}
          >
            {item.isCompleted ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        ) : (
          <Megaphone className="mt-0.5 h-4 w-4 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${item.isCompleted ? "text-muted-foreground line-through" : ""}`}>
            {item.title}
          </p>
          {item.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}

          {isTodo && item.assignee && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Avatar className="h-5 w-5">
                <AvatarImage src={item.assignee.avatarUrl ?? undefined} alt={item.assignee.name} />
                <AvatarFallback className="text-[10px] bg-primary/10">
                  {getInitials(item.assignee.name)}
                </AvatarFallback>
              </Avatar>
              <span>Assigned to {item.assignee.name}</span>
            </div>
          )}
        </div>

        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => onEdit(item)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
