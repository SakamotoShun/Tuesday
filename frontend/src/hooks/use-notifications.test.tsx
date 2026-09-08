import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { Notification, NotificationPage } from "@/api/types"

type ListOptions = { limit?: number; cursor?: string }
type Listener = (event: Record<string, unknown>) => void | Promise<void>

let serverNotifications: Notification[] = []
let list: (options?: ListOptions) => Promise<NotificationPage>
let markRead: (id: string) => Promise<Notification>
let markAllRead: () => Promise<{ updated: number }>
const listeners = new Set<Listener>()
const clients: QueryClient[] = []
const onMessage = (handler: Listener) => {
  listeners.add(handler)
  return () => { listeners.delete(handler) }
}

mock.module("@/api/notifications", () => ({
  notificationsApi: {
    list: (params?: ListOptions) => list(params),
    markRead: (id: string) => markRead(id),
    markAllRead: () => markAllRead(),
  },
}))

mock.module("@/hooks/use-websocket", () => ({
  useWebSocket: () => ({ onMessage }),
}))

const { useNotifications } = await import("./use-notifications")

function notification(id: string, read = false): Notification {
  return {
    id, read, userId: "user-1", sourceEventId: null, type: "mention",
    title: `Mention ${id}`, body: null, link: "/chat", templateVersion: 1,
    templateData: {}, createdAt: "2026-09-08T12:00:00.000Z",
  }
}

function serverPage(options?: ListOptions): NotificationPage {
  const start = options?.cursor
    ? serverNotifications.findIndex((item) => item.id === options.cursor) + 1
    : 0
  const items = serverNotifications.slice(start, start + (options?.limit ?? 50))
  return structuredClone({
    items,
    unreadCount: serverNotifications.filter((item) => !item.read).length,
    nextCursor: start + items.length < serverNotifications.length ? items.at(-1)!.id : null,
  })
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(queryClient)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper, queryClient }
}

async function emit(item: Notification) {
  await act(async () => {
    await Promise.all([...listeners].map((handler) => handler({ type: "notification", notification: item })))
  })
}

describe("useNotifications", () => {
  beforeEach(() => {
    serverNotifications = [notification("n-1")]
    list = async (options) => serverPage(options)
    markRead = async (id) => {
      const item = serverNotifications.find((item) => item.id === id)!
      item.read = true
      return structuredClone(item)
    }
    markAllRead = async () => {
      const unread = serverNotifications.filter((item) => !item.read)
      unread.forEach((item) => { item.read = true })
      return { updated: unread.length }
    }
    listeners.clear()
  })

  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear())
  })

  it("uses the server global count and cursor when loading additional pages", async () => {
    serverNotifications = Array.from({ length: 75 }, (_, i) => notification(`n-${i + 1}`))
    const listMock = mock(async (options?: ListOptions) => serverPage(options))
    list = listMock
    const { result } = renderHook(() => useNotifications(), createWrapper())

    await waitFor(() => expect(result.current.notifications).toHaveLength(50))
    expect(result.current.unreadCount).toBe(75)
    expect(result.current.hasNextPage).toBe(true)
    expect(listMock).toHaveBeenCalledWith({ limit: 50, cursor: undefined })

    await act(async () => { await result.current.fetchNextPage() })
    await waitFor(() => expect(result.current.notifications).toHaveLength(75))
    expect(listMock).toHaveBeenLastCalledWith({ limit: 50, cursor: "n-50" })
    expect(result.current.notifications.at(-1)?.id).toBe("n-75")
    expect(result.current.unreadCount).toBe(75)
    expect(result.current.hasNextPage).toBe(false)
  })

  it("marks an item on a later page read without double-decrementing repeated reads", async () => {
    serverNotifications = Array.from({ length: 60 }, (_, i) => notification(`n-${i + 1}`))
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.notifications).toHaveLength(50))
    await act(async () => { await result.current.fetchNextPage() })

    await act(async () => { await result.current.markRead.mutateAsync("n-55") })
    await waitFor(() => expect(result.current.unreadCount).toBe(59))
    expect(result.current.notifications.find((item) => item.id === "n-55")?.read).toBe(true)
    await act(async () => { await result.current.markRead.mutateAsync("n-55") })
    expect(result.current.unreadCount).toBe(59)
    expect(result.current.notifications).toHaveLength(60)
  })

  it("reconciles the global count when marking an unloaded notification read", async () => {
    serverNotifications = Array.from({ length: 60 }, (_, i) => notification(`n-${i + 1}`))
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.unreadCount).toBe(60))
    await act(async () => { await result.current.markRead.mutateAsync("n-55") })
    await waitFor(() => expect(result.current.unreadCount).toBe(59))
    expect(result.current.notifications).toHaveLength(50)
  })

  it("deduplicates websocket delivery across pages and multiple hook subscribers", async () => {
    serverNotifications = Array.from({ length: 60 }, (_, i) => notification(`n-${i + 1}`))
    const { result } = renderHook(() => ({ first: useNotifications(), second: useNotifications() }), createWrapper())
    await waitFor(() => expect(result.current.first.notifications).toHaveLength(50))
    await act(async () => { await result.current.first.fetchNextPage() })
    await emit(notification("n-55"))
    await waitFor(() => expect(result.current.first.notifications).toHaveLength(60))
    expect(result.current.first.unreadCount).toBe(60)

    const incoming = notification("n-new")
    serverNotifications.unshift(incoming)
    await emit(incoming)
    await emit(incoming)
    await waitFor(() => expect(result.current.first.notifications).toHaveLength(61))
    expect(result.current.first.notifications[0]?.id).toBe("n-new")
    expect(result.current.first.unreadCount).toBe(61)
    expect(result.current.second.unreadCount).toBe(61)

    const alreadyRead = notification("n-read", true)
    serverNotifications.unshift(alreadyRead)
    await emit(alreadyRead)
    await waitFor(() => expect(result.current.first.notifications).toHaveLength(62))
    expect(result.current.first.unreadCount).toBe(61)
  })

  it.each(["initial load", "refetch"])("does not lose websocket notifications during an in-flight %s", async (phase) => {
    const { wrapper } = createWrapper()
    const pending = Promise.withResolvers<NotificationPage>()
    const stalePage = serverPage()
    const listMock = mock(() => pending.promise)
    if (phase === "initial load") list = listMock
    const { result } = renderHook(() => useNotifications(), { wrapper })
    if (phase === "refetch") {
      await waitFor(() => expect(result.current.notifications).toHaveLength(1))
      list = listMock
      act(() => { void result.current.refetch() })
    }
    await waitFor(() => expect(listMock).toHaveBeenCalled())

    const incoming = notification("n-new")
    serverNotifications.unshift(incoming)
    list = async (options) => serverPage(options)
    await emit(incoming)
    await act(async () => { pending.resolve(stalePage) })
    await waitFor(() => expect(result.current.notifications.map((item) => item.id)).toEqual(["n-new", "n-1"]))
    expect(result.current.unreadCount).toBe(2)
  })

  it("reconciles mark-all without marking a later websocket arrival read", async () => {
    const pending = Promise.withResolvers<{ updated: number }>()
    markAllRead = mock(() => {
      serverNotifications.forEach((item) => { item.read = true })
      return pending.promise
    })
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
    let mutation!: Promise<{ updated: number }>
    act(() => { mutation = result.current.markAllRead.mutateAsync() })
    await waitFor(() => expect(markAllRead).toHaveBeenCalled())

    const incoming = notification("n-new")
    serverNotifications.unshift(incoming)
    await emit(incoming)
    await waitFor(() => expect(result.current.notifications[0]?.id).toBe("n-new"))
    // Reconciliation must not claim the new item is read even while its GET is pending.
    const reconciliation = Promise.withResolvers<NotificationPage>()
    const listMock = mock(() => reconciliation.promise)
    list = listMock
    await act(async () => { pending.resolve({ updated: 1 }) })
    await waitFor(() => expect(listMock).toHaveBeenCalled())
    expect(result.current.notifications[0]?.read).toBe(false)
    expect(result.current.markAllRead.isPending).toBe(true)

    await act(async () => {
      reconciliation.resolve(serverPage())
      await mutation
    })
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
    expect(result.current.notifications.find((item) => item.id === "n-1")?.read).toBe(true)
    expect(result.current.notifications[0]?.read).toBe(false)
  })

  it("marks all loaded pages read and clears the server global count", async () => {
    serverNotifications = Array.from({ length: 110 }, (_, i) => notification(`n-${i + 1}`))
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.unreadCount).toBe(110))
    await act(async () => { await result.current.fetchNextPage() })
    await act(async () => { await result.current.markAllRead.mutateAsync() })
    await waitFor(() => expect(result.current.unreadCount).toBe(0))
    expect(result.current.notifications).toHaveLength(100)
    expect(result.current.notifications.every((item) => item.read)).toBe(true)
    expect(result.current.hasNextPage).toBe(true)
  })

  it("exposes an initial list failure and recovers on retry", async () => {
    list = async () => { throw new Error("List unavailable") }
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.error?.message).toBe("List unavailable"))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.notifications).toEqual([])
    list = async (options) => serverPage(options)
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.notifications).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })

  it("retains loaded pages and the count when pagination fails, then retries the same cursor", async () => {
    serverNotifications = Array.from({ length: 60 }, (_, i) => notification(`n-${i + 1}`))
    list = async (options) => {
      if (options?.cursor) throw new Error("Page unavailable")
      return serverPage(options)
    }
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.notifications).toHaveLength(50))
    await act(async () => { await result.current.fetchNextPage() })
    await waitFor(() => expect(result.current.error?.message).toBe("Page unavailable"))
    expect(result.current.notifications).toHaveLength(50)
    expect(result.current.unreadCount).toBe(60)
    expect(result.current.hasNextPage).toBe(true)
    const listMock = mock(async (options?: ListOptions) => serverPage(options))
    list = listMock
    await act(async () => { await result.current.fetchNextPage() })
    await waitFor(() => expect(result.current.notifications).toHaveLength(60))
    expect(listMock).toHaveBeenCalledWith({ limit: 50, cursor: "n-50" })
    expect(result.current.error).toBeNull()
  })

  it.each(["markRead", "markAllRead"] as const)("preserves unread state when %s fails", async (operation) => {
    const failure = new Error("Write unavailable")
    markRead = async () => { throw failure }
    markAllRead = async () => { throw failure }
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
    await act(async () => {
      const mutation = operation === "markRead"
        ? result.current.markRead.mutateAsync("n-1")
        : result.current.markAllRead.mutateAsync()
      await expect(mutation).rejects.toThrow("Write unavailable")
    })
    await waitFor(() => expect(result.current[operation].isError).toBe(true))
    expect(result.current.notifications[0]?.read).toBe(false)
    expect(result.current.unreadCount).toBe(1)
  })

  it("reconciles a write that committed even though its response failed", async () => {
    markAllRead = async () => {
      serverNotifications.forEach((item) => { item.read = true })
      throw new Error("Response lost")
    }
    const { result } = renderHook(() => useNotifications(), createWrapper())
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
    await act(async () => {
      await expect(result.current.markAllRead.mutateAsync()).rejects.toThrow("Response lost")
    })
    await waitFor(() => expect(result.current.unreadCount).toBe(0))
    expect(result.current.notifications[0]?.read).toBe(true)
  })
})
