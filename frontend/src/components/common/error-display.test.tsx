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
import { ErrorDisplay } from "./error-display"

describe("ErrorDisplay", () => {
  it("renders default title", () => {
    const { getByText } = render(<ErrorDisplay />)
    expect(getByText("Something went wrong")).toBeDefined()
  })

  it("renders message and retry button", () => {
    let retried = false
    const { getByText } = render(
      <ErrorDisplay
        title="Oops"
        message="Failed to load"
        onRetry={() => {
          retried = true
        }}
      />
    )

    expect(getByText("Oops")).toBeDefined()
    expect(getByText("Failed to load")).toBeDefined()
    fireEvent.click(getByText("Retry"))
    expect(retried).toBe(true)
  })
})
