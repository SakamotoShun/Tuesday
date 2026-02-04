import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { TaskCard } from "./task-card"
import { AddTaskForm } from "./add-task-form"
import type { Task, TaskStatus } from "@/api/types"

interface KanbanColumnProps {
  status: TaskStatus
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: (title: string, statusId: string) => void
  isLoading?: boolean
}

export function KanbanColumn({
  status,
  tasks,
  onTaskClick,
  onAddTask,
  isLoading,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
    data: { status },
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
            style={{ backgroundColor: status.color }}
          />
          <h3 className="font-medium text-sm">{status.name}</h3>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      {/* Task List */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add Task Form */}
      <div className="p-2 border-t border-border">
        <AddTaskForm
          statusId={status.id}
          onSubmit={onAddTask}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
