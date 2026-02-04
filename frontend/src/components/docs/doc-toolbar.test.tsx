import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { DocToolbar } from "./doc-toolbar"

const renderToolbar = (props: {
  saveState: "saved" | "saving" | "error"
  onDelete?: () => Promise<void>
}) => {
  const onDelete = props.onDelete ?? (async () => {})
  return render(
    <MemoryRouter>
      <DocToolbar
        projectId="project-1"
        title="Product Brief"
        saveState={props.saveState}
        onDelete={onDelete}
      />
    </MemoryRouter>
  )
}

describe("DocToolbar", () => {
  it("should render breadcrumb and saved state", () => {
    renderToolbar({ saveState: "saved" })
    expect(screen.getByText("Docs")).toBeDefined()
    expect(screen.getByText("Product Brief")).toBeDefined()
    expect(screen.getByText("Saved")).toBeDefined()
  })

  it("should call onDelete after confirmation", async () => {
    let deleted = false
    const onDelete = async () => {
      deleted = true
    }

    renderToolbar({ saveState: "saved", onDelete })
    fireEvent.click(screen.getByText("Delete"))
    fireEvent.click(screen.getByText("Delete Doc"))

    expect(deleted).toBe(true)
  })
})
