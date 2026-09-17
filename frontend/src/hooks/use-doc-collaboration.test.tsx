import "@/test/setup"
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { act, renderHook, waitFor } from "@testing-library/react"
import * as Y from "yjs"
const { useDocCollaboration } = await import("./use-doc-collaboration")

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
  it("leaves snapshots to a server-owned persistence peer, including after ACKs and requests", () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const socket = MockWebSocket.instances[0]!
    try {
      act(() => {
        socket.emitOpen()
        socket.emitMessage({ type: "doc.sync", generation: "same", acknowledgement: "operation_id",
          persistence: "server", snapshot: null, updates: [], latestSeq: 0 })
        result.current.ydoc.getText("content").insert(0, "human")
        result.current.sendSnapshot()
      })
      const update = socket.messagesOfType("doc.update")[0]
      act(() => {
        socket.emitMessage({ type: "doc.ack", generation: "same", operationId: update.operationId, seq: 1 })
        socket.emitMessage({ type: "doc.snapshot.request", seq: 1 })
        result.current.sendSnapshot()
      })
      expect(socket.messagesOfType("doc.update")).toHaveLength(1)
      expect(socket.messagesOfType("doc.snapshot")).toHaveLength(0)
      expect(result.current.getRecoveryCopy().pendingUpdates).toHaveLength(0)
      expect(result.current.syncError).toBeNull()
    } finally { unmount() }
  })

  it("expires the oldest sent operation even while newer ACKs arrive, and preserves the next operation's deadline", () => {
    let now = 0, nextId = 0
    const timers = new Map<number, { deadline: number; callback: () => void }>()
    const clock = spyOn(performance, "now").mockImplementation(() => now)
    const schedule = spyOn(window, "setTimeout").mockImplementation((callback, delay) => {
      const id = ++nextId
      timers.set(id, { deadline: now + (delay ?? 0), callback: callback as () => void })
      return id
    })
    const cancel = spyOn(window, "clearTimeout").mockImplementation(id => { timers.delete(id!) })
    const advance = (time: number) => act(() => {
      now = time
      for (const [id, timer] of timers) if (timer.deadline <= now) { timers.delete(id); timer.callback() }
    })
    const sync = { type: "doc.sync", generation: "same", acknowledgement: "operation_id", snapshot: null, updates: [], latestSeq: 0 }
    let unmount = () => {}
    try {
      for (const acknowledgeOldest of [false, true]) {
        const base = now
        const hook = renderHook(() => useDocCollaboration("doc-1"))
        unmount = hook.unmount
        const socket = MockWebSocket.instances.at(-1)!
        act(() => { socket.emitOpen(); socket.emitMessage(sync); hook.result.current.ydoc.getText("content").insert(0, "A") })
        advance(base + 2000)
        act(() => hook.result.current.ydoc.getText("content").insert(1, "B"))
        const updates = socket.messagesOfType("doc.update")
        advance(base + 9000)
        act(() => socket.emitMessage({ type: "doc.ack", generation: "same", seq: 2, operationId: updates[acknowledgeOldest ? 0 : 1].operationId }))
        const deadline = base + (acknowledgeOldest ? 12000 : 10000)
        advance(deadline - 1)
        expect(socket.readyState).toBe(MockWebSocket.OPEN)
        advance(deadline)
        expect(socket.readyState).toBe(MockWebSocket.CLOSED)
        expect(hook.result.current.syncError).toBeNull()
        expect(hook.result.current.getRecoveryCopy().pendingUpdates).toHaveLength(1)
        unmount()
      }
    } finally { unmount(); schedule.mockRestore(); cancel.mockRestore(); clock.mockRestore() }
  })

  it("matches operation ACKs across reconnect, ignores duplicate/unknown ACKs and waits for every edit", async () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const first = MockWebSocket.instances[0]!
    const sync = { type: "doc.sync", generation: "same", acknowledgement: "operation_id", snapshot: null, updates: [], latestSeq: 0 }
    act(() => {
      first.emitOpen(); first.emitMessage(sync)
      result.current.ydoc.getText("content").insert(0, "A")
      result.current.ydoc.getText("content").insert(1, "B")
      first.emitClose()
    })
    const pending = first.messagesOfType("doc.update")
    expect(pending[0].operationId).not.toBe(pending[1].operationId)
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 2000 })
    const second = MockWebSocket.instances[1]!
    act(() => {
      second.emitOpen(); second.emitMessage(sync)
      result.current.sendSnapshot()
      second.emitMessage({ type: "doc.ack", generation: "same", operationId: pending[1].operationId, seq: 2 })
      second.emitMessage({ type: "doc.ack", generation: "same", operationId: pending[1].operationId, seq: 99 })
      second.emitMessage({ type: "doc.ack", generation: "same", operationId: crypto.randomUUID(), seq: 100 })
      second.emitMessage({ type: "doc.ack", generation: "same", seq: 101 })
    })
    expect(second.messagesOfType("doc.update")).toEqual(pending)
    expect(second.messagesOfType("doc.snapshot")).toHaveLength(0)
    act(() => second.emitMessage({ type: "doc.ack", generation: "same", operationId: pending[0].operationId, seq: 1 }))
    expect(second.messagesOfType("doc.snapshot")).toHaveLength(1)
    expect(second.messagesOfType("doc.snapshot")[0].seq).toBe(2)
    unmount()
  })

  it("refuses an acknowledgement downgrade before applying sync or replaying pending operations", async () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const first = MockWebSocket.instances[0]!
    act(() => {
      first.emitOpen()
      first.emitMessage({ type: "doc.sync", generation: "same", acknowledgement: "operation_id", snapshot: null, updates: [], latestSeq: 0 })
      result.current.ydoc.getText("content").insert(0, "pending")
      first.emitClose()
    })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 2000 })
    const replacement = new Y.Doc()
    replacement.getText("content").insert(0, "untrusted")
    const second = MockWebSocket.instances[1]!
    act(() => {
      second.emitOpen()
      second.emitMessage({ type: "doc.sync", generation: "same", latestSeq: 99, updates: [],
        snapshot: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(replacement))) })
    })
    expect(result.current.syncError?.code).toBe("resync_required")
    expect(result.current.ydoc.getText("content").toString()).toBe("pending")
    expect(second.messagesOfType("doc.update")).toHaveLength(0)
    replacement.destroy()
    unmount()
  })

  it("refuses a reset generation before applying sync or replaying queued edits", async () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const first = MockWebSocket.instances[0]!
    act(() => {
      first.emitOpen()
      first.emitMessage({ type: "doc.sync", generation: "old", snapshot: null, updates: [], latestSeq: 0 })
      result.current.ydoc.getText("content").insert(0, "pending")
      first.emitClose()
    })
    expect(first.messagesOfType("doc.update")[0].generation).toBe("old")
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 2000 })
    const replacement = new Y.Doc()
    replacement.getText("content").insert(0, "RESET")
    const second = MockWebSocket.instances[1]!
    act(() => {
      second.emitOpen()
      second.emitMessage({ type: "doc.sync", generation: "new", latestSeq: 0, updates: [],
        snapshot: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(replacement))) })
    })
    expect(result.current.syncError?.code).toBe("resync_required")
    expect(result.current.ydoc.getText("content").toString()).toBe("pending")
    expect(second.messagesOfType("doc.update")).toHaveLength(0)
    const recovery = result.current.getRecoveryCopy()
    expect(recovery.generation).toBe("old")
    expect(recovery.pendingUpdates).toHaveLength(1)
    expect(result.current.syncError?.pendingUpdateCount).toBe(1)
    const recovered = new Y.Doc()
    Y.applyUpdate(recovered, Uint8Array.from(atob(recovery.snapshot), c => c.charCodeAt(0)))
    expect(recovered.getText("content").toString()).toBe("pending")
    expect(replacement.getText("content").toString()).toBe("RESET")
    recovered.destroy()
    replacement.destroy()
    unmount()
  })

  it("replays within a generation and refuses a foreign-generation ACK", async () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const first = MockWebSocket.instances[0]!
    act(() => {
      first.emitOpen()
      first.emitMessage({ type: "doc.sync", generation: "same", snapshot: null, updates: [], latestSeq: 0 })
      result.current.ydoc.getText("content").insert(0, "pending")
      first.emitClose()
    })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 2000 })
    const second = MockWebSocket.instances[1]!
    act(() => {
      second.emitOpen()
      second.emitMessage({ type: "doc.sync", generation: "same", snapshot: null, updates: [], latestSeq: 0 })
      result.current.sendSnapshot()
    })
    expect(second.messagesOfType("doc.update")[0].generation).toBe("same")
    act(() => second.emitMessage({ type: "doc.ack", generation: "foreign", seq: 1 }))
    expect(result.current.syncError?.code).toBe("resync_required")
    expect(second.messagesOfType("doc.snapshot")).toHaveLength(0)
    unmount()
  })

  it("coalesces snapshots until every local update is acknowledged", () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const socket = MockWebSocket.instances[0]!
    act(() => {
      socket.emitOpen()
      socket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
      result.current.ydoc.getText("content").insert(0, "A")
      result.current.sendSnapshot()
      result.current.ydoc.getText("content").insert(1, "B")
      result.current.sendSnapshot()
      socket.emitMessage({ type: "doc.ack", seq: 1 })
    })
    expect(socket.messagesOfType("doc.snapshot")).toHaveLength(0)
    act(() => socket.emitMessage({ type: "doc.ack", seq: 2 }))
    const snapshots = socket.messagesOfType("doc.snapshot")
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].seq).toBe(2)
    const restored = new Y.Doc()
    Y.applyUpdate(restored, Uint8Array.from(atob(snapshots[0].snapshot), c => c.charCodeAt(0)))
    expect(restored.getText("content").toString()).toBe("AB")
    restored.destroy()
    unmount()
  })

  it("does not claim a requested sequence until its content arrives", () => {
    const { unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const socket = MockWebSocket.instances[0]!
    const remote = new Y.Doc()
    remote.getText("content").insert(0, "remote")
    act(() => {
      socket.emitOpen()
      socket.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
      socket.emitMessage({ type: "doc.snapshot.request", seq: 2 })
    })
    expect(socket.messagesOfType("doc.snapshot")).toHaveLength(0)
    act(() => socket.emitMessage({ type: "doc.update", seq: 2,
      update: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(remote))) }))
    expect(socket.messagesOfType("doc.snapshot")).toHaveLength(1)
    expect(socket.messagesOfType("doc.snapshot")[0].seq).toBe(2)
    remote.destroy()
    unmount()
  })

  it("retains edits made after close and regenerates snapshots after replay ACKs", async () => {
    const { result, unmount } = renderHook(() => useDocCollaboration("doc-1"))
    const first = MockWebSocket.instances[0]!
    act(() => {
      first.emitOpen()
      first.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
      first.emitClose()
      result.current.ydoc.getText("content").insert(0, "offline")
      result.current.sendSnapshot()
    })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 1500 })
    const second = MockWebSocket.instances[1]!
    act(() => {
      second.emitOpen()
      second.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
    })
    expect(second.messagesOfType("doc.update")).toHaveLength(1)
    expect(second.messagesOfType("doc.snapshot")).toHaveLength(0)
    act(() => second.emitMessage({ type: "doc.ack", seq: 1 }))
    expect(second.messagesOfType("doc.snapshot")).toHaveLength(1)
    unmount()
  })

  it("ignores delayed close events belonging to a previous document", () => {
    const { result, rerender, unmount } = renderHook(({ id }) => useDocCollaboration(id), { initialProps: { id: "A" } })
    const first = MockWebSocket.instances[0]!
    rerender({ id: "B" })
    const second = MockWebSocket.instances[1]!
    act(() => {
      second.emitOpen()
      second.emitMessage({ type: "doc.sync", snapshot: null, updates: [], latestSeq: 0 })
      first.onclose?.({ code: 1009 })
    })
    expect(result.current.initialSyncComplete).toBe(true)
    expect(result.current.syncError).toBeNull()
    unmount()
  })

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
      message: "The document sync data could not be applied safely. Save a recovery copy of local work before reloading.",
      pendingUpdateCount: 0,
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

  it("suppresses queued writes and remains terminal after a fatal server error", () => {
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
      message: "A document update is too large to sync. Save a recovery copy of local work before reloading.",
      pendingUpdateCount: 0,
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
