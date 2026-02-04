import { describe, it, expect } from "bun:test"
import { render, screen } from "@testing-library/react"
import { TaskCard } from "./task-card"
import type { Task } from "@/api/types"

const mockTask: Task = {
  id: "task-1",
  projectId: "project-1",
  title: "Test Task",
  description: "Test description",
  statusId: "status-1",
  startDate: null,
  dueDate: "2024-12-31",
  sortOrder: 0,
  createdBy: "user-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
}

describe("TaskCard", () => {
  it("should render task title", () => {
    render(<TaskCard task={mockTask} />)
    expect(screen.getByText("Test Task")).toBeDefined()
  })

  it("should display due date badge", () => {
    render(<TaskCard task={mockTask} />)
    expect(screen.getByText(/Dec/)).toBeDefined()
  })
})
