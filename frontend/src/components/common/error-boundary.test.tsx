import "@/test/setup"
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

const { render, waitFor } = await import("@testing-library/react")
const { ErrorBoundary } = await import("./error-boundary")

function Boom() {
  const error = new Error("boom") as Error & { requestId?: string }
  error.requestId = "req-test-123"
  throw error
}

describe("ErrorBoundary", () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    console.error = () => {}
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it("shows the request ID in the fallback", async () => {
    const view = render(
      <ErrorBoundary message="Please refresh and try again.">
        <Boom />
      </ErrorBoundary>
    )

    await waitFor(() => {
      expect(view.getByText("Something went wrong")).toBeDefined()
    })

    expect(view.getByText("Request ID: req-test-123")).toBeDefined()
    expect(view.getByRole("button", { name: "Reload section" })).toBeDefined()
  })
})
