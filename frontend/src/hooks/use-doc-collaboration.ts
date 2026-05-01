import { useEffect, useMemo, useRef, useState } from "react"
import * as Y from "yjs"
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness"
import { useAuthStore } from "@/store/auth-store"

type SyncState = "connecting" | "synced" | "error"

interface UseDocCollaborationOptions {
  getSnapshotContent?: () => Array<Record<string, unknown>> | null
}

const USER_COLORS = [
  "#0F766E",
  "#C2410C",
  "#2563EB",
  "#7C3AED",
  "#16A34A",
  "#DC2626",
  "#EA580C",
  "#0E7490",
]

const pickColor = (seed: string) => {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

const encodeBase64 = (data: Uint8Array) => {
  let binary = ""
  data.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const decodeBase64 = (data: string) => {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const getWsUrl = (docId: string) => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws"
  return `${protocol}://${window.location.host}/api/v1/collab/docs/${docId}`
}

export function useDocCollaboration(docId: string, options: UseDocCollaborationOptions = {}) {
  const user = useAuthStore((state) => state.user)
  const ydoc = useMemo(() => new Y.Doc(), [docId])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])
  const [syncState, setSyncState] = useState<SyncState>("connecting")
  const [hasRemoteContent, setHasRemoteContent] = useState(false)
  const [initialSyncComplete, setInitialSyncComplete] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const pendingMessages = useRef<string[]>([])
  const isCleanedUp = useRef(false)
  const hasOpened = useRef(false)
  const initialSyncCompleteRef = useRef(false)
  const latestServerSeqRef = useRef(0)
  const pendingAwarenessUpdatesRef = useRef<Uint8Array[]>([])

  const sendMessage = (message: Record<string, unknown>) => {
    const payload = JSON.stringify(message)
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(payload)
    } else {
      pendingMessages.current.push(payload)
    }
  }

  const sendSnapshot = (contentOverride?: Array<Record<string, unknown>>) => {
    const snapshot = encodeBase64(Y.encodeStateAsUpdate(ydoc))
    const content = contentOverride ?? options.getSnapshotContent?.() ?? null
    sendMessage({
      type: "doc.snapshot",
      snapshot,
      seq: latestServerSeqRef.current,
      content,
    })
  }

  useEffect(() => {
    const name = user?.name ?? "Anonymous"
    const color = pickColor(user?.id ?? name)
    awareness.setLocalStateField("user", { name, color })
  }, [awareness, user?.id, user?.name])

  useEffect(() => {
    if (!docId) return undefined
    isCleanedUp.current = false
    initialSyncCompleteRef.current = false
    latestServerSeqRef.current = 0
    pendingAwarenessUpdatesRef.current = []
    setInitialSyncComplete(false)
    setHasRemoteContent(false)

    const connect = () => {
      // Don't reconnect if we've been cleaned up
      if (isCleanedUp.current) return

      hasOpened.current = false
      const socket = new WebSocket(getWsUrl(docId))
      socketRef.current = socket
      setSyncState("connecting")

      socket.onopen = () => {
        // Don't proceed if cleaned up during connection
        if (isCleanedUp.current) {
          socket.close()
          return
        }
        hasOpened.current = true
        const queued = pendingMessages.current
        pendingMessages.current = []
        queued.forEach((message) => socket.send(message))
      }

      socket.onclose = () => {
        // Don't reconnect or set error state if this was intentional cleanup
        if (isCleanedUp.current) return
        // Don't set error or reconnect if socket never successfully opened
        // (this happens when the component unmounts during initial connection)
        if (!hasOpened.current) return
        setSyncState("error")
        if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
        reconnectRef.current = window.setTimeout(() => connect(), 1000)
      }

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return
        let message: Record<string, unknown>
        try {
          message = JSON.parse(event.data) as Record<string, unknown>
        } catch {
          return
        }

        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", ts: message.ts }))
          return
        }

        if (message.type === "doc.sync") {
          const snapshot = typeof message.snapshot === "string" ? message.snapshot : null
          const updates = Array.isArray(message.updates) ? message.updates : []
          const latestSeq = typeof message.latestSeq === "number" ? message.latestSeq : 0
          if (snapshot) {
            Y.applyUpdate(ydoc, decodeBase64(snapshot), "remote")
          }
          updates.forEach((update) => {
            if (typeof update === "string") {
              Y.applyUpdate(ydoc, decodeBase64(update), "remote")
            }
          })
          latestServerSeqRef.current = latestSeq
          setHasRemoteContent(Boolean(snapshot) || updates.length > 0)
          initialSyncCompleteRef.current = true
          pendingAwarenessUpdatesRef.current.forEach((update) => {
            applyAwarenessUpdate(awareness, update, "remote")
          })
          pendingAwarenessUpdatesRef.current = []
          setInitialSyncComplete(true)
          setSyncState("synced")
          const localAwarenessUpdate = encodeAwarenessUpdate(awareness, [ydoc.clientID])
          sendMessage({ type: "presence.update", update: encodeBase64(localAwarenessUpdate) })
          return
        }

        if (message.type === "doc.update" && typeof message.update === "string") {
          if (typeof message.seq === "number") {
            latestServerSeqRef.current = Math.max(latestServerSeqRef.current, message.seq)
          }
          Y.applyUpdate(ydoc, decodeBase64(message.update), "remote")
          return
        }

        if (message.type === "doc.ack" && typeof message.seq === "number") {
          latestServerSeqRef.current = Math.max(latestServerSeqRef.current, message.seq)
          return
        }

        if (message.type === "presence.broadcast" && typeof message.update === "string") {
          const update = decodeBase64(message.update)
          if (!initialSyncCompleteRef.current) {
            pendingAwarenessUpdatesRef.current.push(update)
            return
          }

          applyAwarenessUpdate(awareness, update, "remote")
          return
        }

        if (message.type === "doc.snapshot.request") {
          if (typeof message.seq === "number") {
            latestServerSeqRef.current = Math.max(latestServerSeqRef.current, message.seq)
          }
          sendSnapshot()
        }
      }
    }

    connect()

    return () => {
      isCleanedUp.current = true
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
      reconnectRef.current = null
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      awareness.destroy()
      ydoc.destroy()
    }
  }, [awareness, docId, ydoc])

  useEffect(() => {
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || !initialSyncCompleteRef.current) return
      sendMessage({ type: "doc.update", update: encodeBase64(update) })
    }

    const handleAwarenessUpdate = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === "remote" || !initialSyncCompleteRef.current) return
      const clients = added.concat(updated).concat(removed)
      const update = encodeAwarenessUpdate(awareness, clients)
      sendMessage({ type: "presence.update", update: encodeBase64(update) })
    }

    ydoc.on("update", handleDocUpdate)
    awareness.on("update", handleAwarenessUpdate)

    return () => {
      ydoc.off("update", handleDocUpdate)
      awareness.off("update", handleAwarenessUpdate)
    }
  }, [awareness, ydoc])

  return { ydoc, awareness, syncState, hasRemoteContent, initialSyncComplete, sendSnapshot }
}
