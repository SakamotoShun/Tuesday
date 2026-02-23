import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ApplicationCard } from "./application-card"
import type { JobApplication, InterviewStage } from "@/api/types"

interface HiringKanbanColumnProps {
  stage: InterviewStage
  applications: JobApplication[]
  onApplicationClick: (application: JobApplication) => void
  isLoading?: boolean
}

export function HiringKanbanColumn({
  stage,
  applications,
  onApplicationClick,
  isLoading,
}: HiringKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { stage },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full min-w-[280px] max-w-[280px] rounded-lg border bg-muted/30 ${
        isOver ? "border-primary ring-1 ring-primary" : "border-border"
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-medium text-sm">{stage.name}</h3>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {applications.length}
        </span>
      </div>

      {/* Application List */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        <SortableContext
          items={applications.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              onClick={() => onApplicationClick(application)}
            />
          ))}
        </SortableContext>

        {applications.length === 0 && !isLoading && (
          <div className="text-xs text-muted-foreground text-center py-4">
            No candidates
          </div>
        )}
      </div>
    </div>
  )
}
