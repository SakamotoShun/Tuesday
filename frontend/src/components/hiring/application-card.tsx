import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Calendar, MessageSquare, Star } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { JobApplication } from "@/api/types"

interface ApplicationCardProps {
  application: JobApplication
  onClick?: () => void
}

export function ApplicationCard({ application, onClick }: ApplicationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application.id, data: { application } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const candidate = application.candidate
  const interviews = application.interviews || []
  const avgRating =
    interviews.filter((i) => i.rating).length > 0
      ? interviews.reduce((sum, i) => sum + (i.rating || 0), 0) /
        interviews.filter((i) => i.rating).length
      : null

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="group cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <button
            className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {candidate?.name || "Unknown Candidate"}
            </p>

            {candidate?.email && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {candidate.email}
              </p>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {candidate?.source && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {candidate.source}
                </Badge>
              )}

              {interviews.length > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {interviews.length}
                </span>
              )}

              {avgRating !== null && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="h-3 w-3" />
                  {avgRating.toFixed(1)}
                </span>
              )}

              {application.appliedAt && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {new Date(application.appliedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
