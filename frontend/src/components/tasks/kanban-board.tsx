import { useState, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { KanbanColumn } from "./kanban-column"
import { TaskCard } from "./task-card"
import type { Task, TaskStatus } from "@/api/types"

interface KanbanBoardProps {
  tasks: Task[]
  statuses: TaskStatus[]
  onTaskMove: (taskId: string, statusId: string) => void
  onTaskReorder: (taskId: string, sortOrder: number) => void
  onAddTask: (title: string, statusId: string) => void
  onTaskClick: (task: Task) => void
  isLoading?: boolean
}

export function KanbanBoard({
  tasks,
  statuses,
  onTaskMove,
  onTaskReorder,
  onAddTask,
  onTaskClick,
  isLoading,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks)
  const [originalStatusId, setOriginalStatusId] = useState<string | null>(null)

  // Update local tasks when props change
  useMemo(() => {
    setLocalTasks(tasks)
  }, [tasks])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {}
    statuses.forEach((status) => {
      grouped[status.id] = localTasks
        .filter((t) => t.statusId === status.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    })
    return grouped
  }, [localTasks, statuses])

  const activeTask = useMemo(() => {
    return activeId ? localTasks.find((t) => t.id === activeId) : null
  }, [activeId, localTasks])

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = event.active.id as string
    setActiveId(taskId)
    
    // Store the original status before any drag operations
    const task = tasks.find((t) => t.id === taskId)
    setOriginalStatusId(task?.statusId ?? null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTask = localTasks.find((t) => t.id === activeId)
    if (!activeTask) return

    const overTask = localTasks.find((t) => t.id === overId)
    const overStatus = statuses.find((s) => s.id === overId)

    // Dragging over a column (not a task)
    if (overStatus && activeTask.statusId !== overStatus.id) {
      setLocalTasks((tasks) =>
        tasks.map((t) =>
          t.id === activeId ? { ...t, statusId: overStatus.id } : t
        )
      )
    }

    // Dragging over another task in different column
    if (overTask && activeTask.statusId !== overTask.statusId) {
      setLocalTasks((tasks) =>
        tasks.map((t) =>
          t.id === activeId ? { ...t, statusId: overTask.statusId } : t
        )
      )
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    setActiveId(null)

    const activeId = active.id as string

    // If dropped outside any valid drop zone, revert to original status
    if (!over) {
      // Revert local state to original status
      if (originalStatusId !== null) {
        setLocalTasks((tasks) =>
          tasks.map((t) =>
            t.id === activeId ? { ...t, statusId: originalStatusId } : t
          )
        )
      }
      setOriginalStatusId(null)
      return
    }

    const overId = over.id as string

    const activeTask = localTasks.find((t) => t.id === activeId)
    if (!activeTask) {
      setOriginalStatusId(null)
      return
    }

    const overTask = localTasks.find((t) => t.id === overId)
    const overStatus = statuses.find((s) => s.id === overId)

    // Dropped on a column
    if (overStatus) {
      // Compare against original status, not the updated local state
      if (originalStatusId !== overStatus.id) {
        onTaskMove(activeId, overStatus.id)
      }
      setOriginalStatusId(null)
      return
    }

    // Dropped on another task
    if (overTask) {
      // Different column - move task
      // Compare against original status
      if (originalStatusId !== overTask.statusId && overTask.statusId) {
        onTaskMove(activeId, overTask.statusId)
        setOriginalStatusId(null)
        return
      }

      // Same column - reorder
      if (activeId !== overId && activeTask.statusId) {
        const columnTasks = tasksByStatus[activeTask.statusId]
        if (columnTasks) {
          const activeIndex = columnTasks.findIndex((t) => t.id === activeId)
          const overIndex = columnTasks.findIndex((t) => t.id === overId)

          if (activeIndex !== overIndex) {
            const newTasks = arrayMove(columnTasks, activeIndex, overIndex)
            // Calculate new sort order based on position
            const newSortOrder = overIndex * 1000
            onTaskReorder(activeId, newSortOrder)
          }
        }
      }
    }
    
    setOriginalStatusId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {statuses
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((status) => (
            <KanbanColumn
              key={status.id}
              status={status}
              tasks={tasksByStatus[status.id] || []}
              onTaskClick={onTaskClick}
              onAddTask={onAddTask}
              isLoading={isLoading}
            />
          ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard task={activeTask} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
