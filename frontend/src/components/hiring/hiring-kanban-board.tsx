import { useState, useMemo, useCallback } from "react"
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { HiringKanbanColumn } from "./hiring-kanban-column"
import { ApplicationCard } from "./application-card"
import type { JobApplication, InterviewStage } from "@/api/types"

interface HiringKanbanBoardProps {
  applications: JobApplication[]
  stages: InterviewStage[]
  onApplicationMove: (applicationId: string, stageId: string) => void
  onApplicationClick: (application: JobApplication) => void
  isLoading?: boolean
}

export function HiringKanbanBoard({
  applications,
  stages,
  onApplicationMove,
  onApplicationClick,
  isLoading,
}: HiringKanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localApplications, setLocalApplications] = useState<JobApplication[]>(applications)
  const [originalStageId, setOriginalStageId] = useState<string | null>(null)

  // Update local applications when props change
  useMemo(() => {
    setLocalApplications(applications)
  }, [applications])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Group applications by stage
  const applicationsByStage = useMemo(() => {
    const grouped: Record<string, JobApplication[]> = {}
    stages.forEach((stage) => {
      grouped[stage.id] = localApplications
        .filter((a) => a.stageId === stage.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    })
    return grouped
  }, [localApplications, stages])

  const activeApplication = useMemo(() => {
    return activeId ? localApplications.find((a) => a.id === activeId) : null
  }, [activeId, localApplications])

  const stageIds = useMemo(() => new Set(stages.map((stage) => stage.id)), [stages])

  const collisionDetectionStrategy = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args)

    if (pointerCollisions.length > 0) {
      const applicationCollisions = pointerCollisions.filter(
        ({ id }) => !stageIds.has(String(id))
      )

      return applicationCollisions.length > 0 ? applicationCollisions : pointerCollisions
    }

    return rectIntersection(args)
  }, [stageIds])

  const handleDragStart = (event: DragStartEvent) => {
    const appId = event.active.id as string
    setActiveId(appId)
    const app = applications.find((a) => a.id === appId)
    setOriginalStageId(app?.stageId ?? null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeApp = localApplications.find((a) => a.id === activeId)
    if (!activeApp) return

    const overApp = localApplications.find((a) => a.id === overId)
    const overStage = stages.find((s) => s.id === overId)

    if (overStage && activeApp.stageId !== overStage.id) {
      setLocalApplications((apps) =>
        apps.map((a) => (a.id === activeId ? { ...a, stageId: overStage.id } : a))
      )
    }

    if (overApp && activeApp.stageId !== overApp.stageId) {
      setLocalApplications((apps) =>
        apps.map((a) => (a.id === activeId ? { ...a, stageId: overApp.stageId } : a))
      )
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    const activeId = active.id as string

    if (!over) {
      if (originalStageId !== null) {
        setLocalApplications((apps) =>
          apps.map((a) => (a.id === activeId ? { ...a, stageId: originalStageId } : a))
        )
      }
      setOriginalStageId(null)
      return
    }

    const overId = over.id as string
    const activeApp = localApplications.find((a) => a.id === activeId)
    if (!activeApp) {
      setOriginalStageId(null)
      return
    }

    const overApp = localApplications.find((a) => a.id === overId)
    const overStage = stages.find((s) => s.id === overId)

    if (overStage) {
      if (originalStageId !== overStage.id) {
        onApplicationMove(activeId, overStage.id)
      }
      setOriginalStageId(null)
      return
    }

    if (overApp) {
      if (originalStageId !== overApp.stageId && overApp.stageId) {
        onApplicationMove(activeId, overApp.stageId)
      }
    }

    setOriginalStageId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {stages
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((stage) => (
            <HiringKanbanColumn
              key={stage.id}
              stage={stage}
              applications={applicationsByStage[stage.id] || []}
              onApplicationClick={onApplicationClick}
              isLoading={isLoading}
            />
          ))}
      </div>

      <DragOverlay>
        {activeApplication ? (
          <div className="w-[264px]">
            <ApplicationCard application={activeApplication} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
