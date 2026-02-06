import "@/test/setup"
import React from "react"
import { describe, it, expect } from "bun:test"
import { Window } from "happy-dom"

if (typeof globalThis.document === "undefined") {
  const window = new Window()
  globalThis.window = window as unknown as Window & typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.navigator = window.navigator as unknown as Navigator
}

const { render } = await import("@testing-library/react")
import { KanbanBoard } from "./kanban-board"
import type { Task, TaskStatus } from "@/api/types"

const statuses: TaskStatus[] = [
  { id: "status-1", name: "To Do", color: "#000", sortOrder: 1, isDefault: true },
  { id: "status-2", name: "Done", color: "#111", sortOrder: 2, isDefault: false },
]

const tasks: Task[] = [
  {
    id: "task-1",
    projectId: "project-1",
    title: "Task One",
    description: "Desc",
    statusId: "status-1",
    startDate: null,
    dueDate: null,
    sortOrder: 0,
    createdBy: "user-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
]

describe("KanbanBoard", () => {
  it("renders columns and tasks", () => {
    const { getByText } = render(
      <KanbanBoard
        tasks={tasks}
        statuses={statuses}
        onTaskMove={() => {}}
        onTaskReorder={() => {}}
        onAddTask={() => {}}
        onTaskClick={() => {}}
      />
    )

    expect(getByText("To Do")).toBeDefined()
    expect(getByText("Done")).toBeDefined()
    expect(getByText("Task One")).toBeDefined()
  })
})
