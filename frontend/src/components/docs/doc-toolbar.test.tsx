import "@/test/setup"
import { describe, it, expect } from "bun:test"
import { Window } from "happy-dom"

if (typeof globalThis.document === "undefined") {
  const window = new Window()
  globalThis.window = window as unknown as Window & typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.navigator = window.navigator as unknown as Navigator
}

const { render, fireEvent } = await import("@testing-library/react")
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
    const { getByText } = renderToolbar({ saveState: "saved" })
    expect(getByText("Docs")).toBeDefined()
    expect(getByText("Product Brief")).toBeDefined()
    expect(getByText("Saved")).toBeDefined()
  })

  it("should call onDelete after confirmation", async () => {
    let deleted = false
    const onDelete = async () => {
      deleted = true
    }

    const { getByText, getAllByText } = renderToolbar({ saveState: "saved", onDelete })
    fireEvent.click(getByText("Delete"))
    // "Delete Doc" appears in both the dialog title and the confirm button; click the button
    const matches = getAllByText("Delete Doc")
    const confirmBtn = matches.find((el) => el.tagName === "BUTTON") || matches[matches.length - 1]
    fireEvent.click(confirmBtn!)

    expect(deleted).toBe(true)
  })
})
