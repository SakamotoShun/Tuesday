import "@/test/setup"
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

const { render, waitFor } = await import("@testing-library/react")
const { captureRequestId } = await import("@/api/client")
const { ErrorBoundary } = await import("./error-boundary")

function Boom() {
  throw new Error("boom")
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
    captureRequestId(new Response(null, { headers: { "X-Request-Id": "req-test-123" } }))

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
