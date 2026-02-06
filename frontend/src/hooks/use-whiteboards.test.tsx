import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let list: (...args: any[]) => Promise<any> = async () => []
let get: (...args: any[]) => Promise<any> = async () => null
let create: (...args: any[]) => Promise<any> = async () => ({ id: "whiteboard-1" })
let update: (...args: any[]) => Promise<any> = async () => ({ id: "whiteboard-1" })
let remove: (...args: any[]) => Promise<any> = async () => true

mock.module("@/api/whiteboards", () => ({
  whiteboardsApi: {
    list: (projectId: string) => list(projectId),
    get: (whiteboardId: string) => get(whiteboardId),
    create: (projectId: string, data: any) => create(projectId, data),
    update: (whiteboardId: string, data: any) => update(whiteboardId, data),
    delete: (whiteboardId: string) => remove(whiteboardId),
  },
}))

const { useWhiteboards } = await import("./use-whiteboards")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe("useWhiteboards", () => {
  beforeEach(() => {
    list = async () => []
    get = async () => null
    create = async () => ({ id: "whiteboard-1" })
    update = async () => ({ id: "whiteboard-1" })
    remove = async () => true
  })

  it("loads project whiteboards", async () => {
    list = async () => [{ id: "whiteboard-1" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useWhiteboards("project-1"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.whiteboards).toEqual([{ id: "whiteboard-1" }] as any)
  })
})
