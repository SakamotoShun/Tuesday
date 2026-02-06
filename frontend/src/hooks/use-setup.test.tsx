import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let getStatus: (...args: any[]) => Promise<any> = async () => ({ initialized: false })
let complete: (...args: any[]) => Promise<any> = async () => null

mock.module("@/api/setup", () => ({
  getStatus: () => getStatus(),
  complete: (data: any) => complete(data),
}))

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

describe("useSetup", () => {
  beforeEach(() => {
    getStatus = async () => ({ initialized: false })
    complete = async () => null
  })

  it("loads setup status", async () => {
    getStatus = async () => ({ initialized: true })
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
