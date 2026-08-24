import "@/test/setup"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { act, renderHook, waitFor } from "@testing-library/react"
import * as Y from "yjs"
import { useDocCollaboration } from "./use-doc-collaboration"

type SocketEvent = { data?: unknown; code?: number; reason?: string }

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []

  readonly url: string
  readyState = MockWebSocket.CONNECTING
  sent: string[] = []
  onopen: ((event: SocketEvent) => void) | null = null
  onclose: ((event: SocketEvent) => void) | null = null
  onmessage: ((event: SocketEvent) => void) | null = null

  constructor(url: string | URL) {
    this.url = String(url)
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) throw new Error("Socket is not open")
    this.sent.push(data)
  }

  close(code = 1000, reason = "") {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({})
  }

  emitMessage(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  emitClose(code = 1006, reason = "network lost") {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  messagesOfType(type: string) {
    return this.sent.map((message) => JSON.parse(message)).filter((message) => message.type === type)
  }
}

const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
  MockWebSocket.instances = []
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket
})

describe("useDocCollaboration", () => {
  it("waits for sync before flushing a document update after reconnect", async () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const firstSocket = MockWebSocket.instances[0]!

    act(() => {
      firstSocket.emitOpen()
      firstSocket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
    })
    expect(result.current.initialSyncComplete).toBe(true)

    act(() => {
      firstSocket.readyState = MockWebSocket.CLOSED
      result.current.ydoc.getText("content").insert(0, "queued")
      firstSocket.emitClose()
    })
    expect(result.current.initialSyncComplete).toBe(false)

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 1500 })
    const secondSocket = MockWebSocket.instances[1]!
    act(() => secondSocket.emitOpen())
    expect(secondSocket.messagesOfType("doc.update")).toHaveLength(0)

    act(() => secondSocket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 }))
    expect(secondSocket.messagesOfType("doc.update")).toHaveLength(1)
    expect(result.current.initialSyncComplete).toBe(true)
    unmount()
  })

  it("resends a sent document update after reconnect until it is acknowledged", async () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const firstSocket = MockWebSocket.instances[0]!

    act(() => {
      firstSocket.emitOpen()
      firstSocket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
      result.current.ydoc.getText("content").insert(0, "sent before disconnect")
    })
    expect(firstSocket.messagesOfType("doc.update")).toHaveLength(1)

    act(() => firstSocket.emitClose())
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 1500 })
    const secondSocket = MockWebSocket.instances[1]!
    act(() => secondSocket.emitOpen())
    expect(secondSocket.messagesOfType("doc.update")).toHaveLength(0)

    act(() => secondSocket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 }))
    expect(secondSocket.messagesOfType("doc.update")).toHaveLength(1)

    act(() => {
      secondSocket.emitMessage({ type: "doc.ack", seq: 1 })
      secondSocket.emitClose()
    })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(3), { timeout: 1500 })
    const thirdSocket = MockWebSocket.instances[2]!
    act(() => {
      thirdSocket.emitOpen()
      thirdSocket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 1 })
    })
    expect(thirdSocket.messagesOfType("doc.update")).toHaveLength(0)
    unmount()
  })

  it("fails closed when sync data cannot be decoded or applied", () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const socket = MockWebSocket.instances[0]!

    act(() => {
      socket.emitOpen()
      socket.emitMessage({ type: "doc.sync", snapshot: "%%%", updates: [], latestSeq: 0 })
    })

    expect(result.current.initialSyncComplete).toBe(false)
    expect(result.current.syncError).toEqual({
      code: "sync_apply_failed",
      message: "The document sync data could not be applied safely. Reload the page before editing.",
      requiresReload: true,
    })
    expect(socket.readyState).toBe(MockWebSocket.CLOSED)
    unmount()
  })

  for (const code of ["invalid_update", "update_too_large", "resync_required"] as const) {
    it(`treats ${code} as fatal for the current document`, () => {
      const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
      const socket = MockWebSocket.instances[0]!
      const validUpdate = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(new Y.Doc())))

      act(() => {
        socket.emitOpen()
        socket.emitMessage({ type: "doc.sync", snapshot: validUpdate, updates: [], latestSeq: 0 })
        socket.emitMessage({ type: "error", code, message: "Rejected" })
      })

      expect(result.current.syncError?.code).toBe(code)
      expect(result.current.syncError?.requiresReload).toBe(true)
      expect(result.current.initialSyncComplete).toBe(false)
      expect(socket.readyState).toBe(MockWebSocket.CLOSED)
      unmount()
    })
  }

  it("discards queued writes and remains terminal after a fatal server error", () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const socket = MockWebSocket.instances[0]!

    act(() => {
      socket.emitOpen()
      socket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
      socket.readyState = MockWebSocket.CONNECTING
      result.current.ydoc.getText("content").insert(0, "discard me")
      socket.readyState = MockWebSocket.OPEN
      socket.emitMessage({ type: "error", code: "resync_required" })
      socket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
    })

    expect(socket.messagesOfType("doc.update")).toHaveLength(0)
    expect(result.current.syncError?.code).toBe("resync_required")
    expect(result.current.initialSyncComplete).toBe(false)
    unmount()
  })

  it("treats an oversized WebSocket close as terminal", () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const socket = MockWebSocket.instances[0]!

    act(() => {
      socket.emitOpen()
      socket.emitClose(1009, "Document sync state too large")
    })

    expect(result.current.syncError).toEqual({
      code: "update_too_large",
      message: "A document update is too large to sync. Reload the page before editing again.",
      requiresReload: true,
    })
    expect(result.current.initialSyncComplete).toBe(false)
    unmount()
  })

  it("sends snapshots without the ignored canonical content copy", () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const socket = MockWebSocket.instances[0]!

    act(() => {
      socket.emitOpen()
      socket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 4 })
      socket.emitMessage({ type: "doc.snapshot.request", seq: 4 })
    })

    expect(socket.messagesOfType("doc.snapshot")).toEqual([
      expect.objectContaining({ type: "doc.snapshot", seq: 4, snapshot: expect.any(String) }),
    ])
    expect(socket.messagesOfType("doc.snapshot")[0]).not.toHaveProperty("content")
    expect(result.current.initialSyncComplete).toBe(true)
    unmount()
  })
})
