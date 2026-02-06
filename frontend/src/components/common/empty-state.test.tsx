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

const { render, fireEvent } = await import("@testing-library/react")
import { EmptyState } from "./empty-state"

describe("EmptyState", () => {
  it("renders title and description", () => {
    const { getByText } = render(
      <EmptyState title="No data" description="Nothing here yet" />
    )
    expect(getByText("No data")).toBeDefined()
    expect(getByText("Nothing here yet")).toBeDefined()
  })

  it("renders action button", () => {
    let clicked = false
    const { getByText } = render(
      <EmptyState
        title="No data"
        actionLabel="Create"
        onAction={() => {
          clicked = true
        }}
      />
    )

    fireEvent.click(getByText("Create"))
    expect(clicked).toBe(true)
  })
})
