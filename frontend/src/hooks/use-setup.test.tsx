import "@/test/setup"
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let getStatus: (...args: any[]) => Promise<any> = async () => ({ initialized: false })
let complete: (...args: any[]) => Promise<any> = async () => null

const { useSetup } = await import("./use-setup")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

function jsonResponse(body: unknown, status = 200, requestId = "req-test") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  })
}

describe("useSetup", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    getStatus = async () => ({ initialized: false })
    complete = async () => null

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const url = new URL(rawUrl, "http://localhost")
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")

      if (url.pathname === "/api/v1/setup/status" && method === "GET") {
        return jsonResponse({ data: await getStatus() }, 200, "req-setup-status")
      }

      if (url.pathname === "/api/v1/setup/complete" && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        await complete(body)
        return jsonResponse({ data: { message: "ok" } }, 200, "req-setup-complete")
      }

      throw new Error(`Unhandled fetch in use-setup.test.tsx: ${method} ${url.pathname}`)
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("loads setup status", async () => {
    getStatus = async () => ({ initialized: true, passwordResetEnabled: true })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useSetup(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isInitialized).toBe(true)
  })

  it("runs setup completion", async () => {
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useSetup(), { wrapper })

    await result.current.complete.mutateAsync({
      workspaceName: "Tuesday",
      adminEmail: "admin@example.com",
      adminName: "Admin",
      adminPassword: "password-123",
    })

    await waitFor(() => expect(result.current.complete.isSuccess).toBe(true))
  })
})
