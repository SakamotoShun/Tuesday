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
import { MemoryRouter } from "react-router-dom"
import { ProjectRow } from "./project-row"
import type { Project } from "@/api/types"

const project: Project = {
  id: "project-1",
  name: "Project Alpha",
  client: null,
  statusId: "status-1",
  type: "Internal",
  startDate: null,
  targetEndDate: null,
  ownerId: "user-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  status: { id: "status-1", name: "Active", color: "#000", sortOrder: 1, isDefault: true },
  members: [],
}

describe("ProjectRow", () => {
  it("renders project name and client", () => {
    const { getByText, getAllByText } = render(
      <MemoryRouter>
        <ProjectRow project={project} />
      </MemoryRouter>
    )

    expect(getByText("Project Alpha")).toBeDefined()
    // "Internal" appears both as client fallback text and type badge
    expect(getAllByText("Internal").length).toBeGreaterThanOrEqual(1)
  })
})
