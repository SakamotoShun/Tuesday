import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import type { Task } from "@/api/types"
import { Calendar, GripVertical, Pencil } from "lucide-react"

interface TaskCardProps {
  task: Task
  onClick?: () => void
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="group relative">
      <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="space-y-2">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <div {...listeners} className="cursor-grab active:cursor-grabbing">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-medium leading-tight truncate text-left">
                  {task.title}
                </p>
                {task.dueDate && (
                  <Badge
                    variant={isOverdue ? "destructive" : "secondary"}
                    className="text-xs font-normal shrink-0"
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(task.dueDate)}
                  </Badge>
                )}
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onClick?.()
                }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-background/80 hover:bg-background shadow-sm"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {task.assignees && task.assignees.length > 0 && (
              <div className="flex items-center justify-start gap-2 flex-wrap">
                <div className="flex -space-x-1">
                  {task.assignees.slice(0, 3).map((assignee, index) => (
                    <Avatar
                      key={assignee.id}
                      className="h-5 w-5 border-2 border-background"
                      style={{ zIndex: (task.assignees?.length ?? 0) - index }}
                    >
                      <AvatarFallback className="text-[10px] bg-primary/10">
                        {getInitials(assignee.name)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {(task.assignees?.length ?? 0) > 3 && (
                    <Avatar className="h-5 w-5 border-2 border-background">
                      <AvatarFallback className="text-[10px] bg-muted">
                        +{(task.assignees?.length ?? 0) - 3}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
