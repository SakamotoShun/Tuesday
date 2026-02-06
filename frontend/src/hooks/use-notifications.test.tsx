import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let list: (...args: any[]) => Promise<any> = async () => []
let markRead: (...args: any[]) => Promise<any> = async () => ({ id: "n-1", read: true })
let markAllRead: (...args: any[]) => Promise<any> = async () => null

let onMessageHandler: ((event: any) => void) | null = null

mock.module("@/api/notifications", () => ({
  notificationsApi: {
    list: (params?: any) => list(params),
    markRead: (id: string) => markRead(id),
    markAllRead: () => markAllRead(),
  },
}))

mock.module("@/hooks/use-websocket", () => ({
  useWebSocket: () => ({
    onMessage: (handler: (event: any) => void) => {
      onMessageHandler = handler
      return () => {
        onMessageHandler = null
      }
    },
  }),
}))

const { useNotifications } = await import("./use-notifications")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe("useNotifications", () => {
  beforeEach(() => {
    list = async () => []
    markRead = async () => ({ id: "n-1", read: true })
    markAllRead = async () => null
    onMessageHandler = null
  })

  it("loads notifications", async () => {
    list = async () => [{ id: "n-1", read: false }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.notifications).toEqual([{ id: "n-1", read: false }] as any)
    expect(result.current.unreadCount).toBe(1)
  })

  it("marks notification as read", async () => {
    list = async () => [{ id: "n-1", read: false }]
    markRead = async () => ({ id: "n-1", read: true })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useNotifications(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await result.current.markRead.mutateAsync("n-1")
    await waitFor(() => expect(result.current.unreadCount).toBe(0))
  })

  it("adds new notifications from websocket", async () => {
    list = async () => []
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    onMessageHandler?.({
      type: "notification",
      notification: { id: "n-2", read: false },
    })

    await waitFor(() => expect(result.current.notifications[0]?.id).toBe("n-2"))
  })
})
