import "@/test/setup"
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useWhiteboardCollab, type WhiteboardSceneUpdate } from "./use-whiteboard-collab"

type SocketListener = (event: { data?: unknown; code?: number; reason?: string }) => void

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []

  readonly url: string
  readyState = MockWebSocket.CONNECTING
  sent: string[] = []
  private listeners = new Map<string, Set<SocketListener>>()

  constructor(url: string | URL) {
    this.url = String(url)
    MockWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? new Set<SocketListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) throw new Error("Socket is not open")
    this.sent.push(data)
  }

  close(code = 1000, reason = "") {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    this.emit("close", { code, reason })
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN
    this.emit("open", {})
  }

  emitMessage(message: Record<string, unknown>) {
    this.emit("message", { data: JSON.stringify(message) })
  }

  emitClose(code: number, reason = "") {
    this.readyState = MockWebSocket.CLOSED
    this.emit("close", { code, reason })
  }

  messagesOfType(type: string) {
    return this.sent.map((message) => JSON.parse(message)).filter((message) => message.type === type)
  }

  private emit(type: string, event: { data?: unknown; code?: number; reason?: string }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

const originalWebSocket = globalThis.WebSocket

const scene: WhiteboardSceneUpdate = {
  elements: [{ id: "shape-1", version: 1, versionNonce: 10 }],
  files: {},
}

const syncMessage = {
  type: "whiteboard.sync",
  snapshot: { elements: [], files: {} },
  updates: [],
  latestSeq: 0,
  collaborators: [],
}

beforeEach(() => {
  MockWebSocket.instances = []
  window.localStorage.clear()
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket
  window.localStorage.clear()
})

describe("useWhiteboardCollab", () => {
  it("queues until sync and marks changes saved only after acknowledgement", () => {
    const onSync = mock(() => {})
    const onAck = mock(() => {})
    const { result, unmount } = renderHook(() => useWhiteboardCollab({
      whiteboardId: "wb-1",
      currentUser: { id: "user-1", name: "Ada" },
      onSync,
      onRemoteUpdate: () => {},
      onAck,
      getSnapshot: () => scene,
    }))
    const socket = MockWebSocket.instances[0]!

    act(() => {
      result.current.sendUpdate(scene)
      socket.emitOpen()
    })
    expect(result.current.isSaving).toBe(true)
    expect(socket.messagesOfType("whiteboard.update")).toHaveLength(0)

    act(() => socket.emitMessage(syncMessage))
    expect(result.current.isReady).toBe(true)
    expect(onSync).toHaveBeenCalledWith(syncMessage, scene)
    expect(socket.messagesOfType("whiteboard.update")).toEqual([{ type: "whiteboard.update", update: scene }])
    expect(result.current.isSaving).toBe(true)

    act(() => socket.emitMessage({ type: "whiteboard.ack", seq: 7 }))
    expect(onAck).toHaveBeenCalledWith(scene, 7)
    expect(result.current.isSaving).toBe(false)
    expect(window.localStorage.getItem("whiteboard-draft:wb-1")).toBeNull()
    unmount()
  })

  it("reconnects and resends an unacknowledged scene after synchronization", async () => {
    const { result, unmount } = renderHook(() => useWhiteboardCollab({
      whiteboardId: "wb-1",
      onSync: () => {},
      onRemoteUpdate: () => {},
      getSnapshot: () => scene,
    }))
    const firstSocket = MockWebSocket.instances[0]!

    act(() => {
      result.current.sendUpdate(scene)
      firstSocket.emitOpen()
      firstSocket.emitMessage(syncMessage)
    })
    expect(firstSocket.messagesOfType("whiteboard.update")).toHaveLength(1)

    act(() => firstSocket.emitClose(1006, "network lost"))
    expect(result.current.status).toBe("reconnecting")
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2), { timeout: 1000 })

    const secondSocket = MockWebSocket.instances[1]!
    act(() => {
      secondSocket.emitOpen()
      secondSocket.emitMessage(syncMessage)
    })
    expect(secondSocket.messagesOfType("whiteboard.update")).toEqual([{ type: "whiteboard.update", update: scene }])
    expect(result.current.isSaving).toBe(true)
    unmount()
  })

  it("flushes the latest debounced scene before unmount", () => {
    const { result, unmount } = renderHook(() => useWhiteboardCollab({
      whiteboardId: "wb-1",
      onSync: () => {},
      onRemoteUpdate: () => {},
      getSnapshot: () => scene,
    }))
    const socket = MockWebSocket.instances[0]!
    act(() => {
      socket.emitOpen()
      socket.emitMessage(syncMessage)
    })

    act(() => result.current.sendUpdate(scene))
    expect(socket.messagesOfType("whiteboard.update")).toHaveLength(0)
    unmount()

    expect(socket.messagesOfType("whiteboard.update")).toEqual([{ type: "whiteboard.update", update: scene }])
  })

  it("echoes snapshot sequence numbers and surfaces oversized-scene failures", () => {
    const { result, unmount } = renderHook(() => useWhiteboardCollab({
      whiteboardId: "wb-1",
      onSync: () => {},
      onRemoteUpdate: () => {},
      getSnapshot: () => scene,
    }))
    const socket = MockWebSocket.instances[0]!
    act(() => {
      socket.emitOpen()
      socket.emitMessage(syncMessage)
      socket.emitMessage({ type: "whiteboard.snapshot.request", seq: 42 })
    })

    expect(socket.messagesOfType("whiteboard.snapshot")).toEqual([{
      type: "whiteboard.snapshot",
      snapshot: scene,
      seq: 42,
    }])

    act(() => socket.emitClose(1009, "Message too large"))
    expect(result.current.status).toBe("closed")
    expect(result.current.error).toContain("WHITEBOARD_MAX_MESSAGE_MB")
    unmount()
  })
})
