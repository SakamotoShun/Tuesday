import { useEffect, useMemo, useRef, useState } from "react"
import * as Y from "yjs"
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness"
import { useAuthStore } from "@/store/auth-store"

type SyncState = "connecting" | "synced" | "error"

export type DocCollaborationSyncErrorCode =
  | "invalid_update"
  | "update_too_large"
  | "resync_required"
  | "sync_apply_failed"

export interface DocCollaborationSyncError {
  code: DocCollaborationSyncErrorCode
  message: string
  requiresReload: true
}

type ServerMessage =
  | { type: "ping"; ts?: unknown }
  | { type: "doc.sync"; snapshot?: unknown; updates?: unknown; latestSeq?: unknown }
  | { type: "doc.update"; update?: unknown; seq?: unknown }
  | { type: "doc.ack"; seq?: unknown }
  | { type: "presence.broadcast"; update?: unknown }
  | { type: "doc.snapshot.request"; seq?: unknown }
  | { type: "error"; code?: unknown; message?: unknown }
  | { type: string; [key: string]: unknown }

interface UseDocCollaborationOptions {
  onLocalChange?: () => void
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

const FATAL_SYNC_ERROR_MESSAGES: Record<DocCollaborationSyncErrorCode, string> = {
  invalid_update: "A document update was rejected as invalid. Reload the page to resync before editing.",
  update_too_large: "A document update is too large to sync. Reload the page before editing again.",
  resync_required: "This document must be resynchronized. Reload the page before editing.",
  sync_apply_failed: "The document sync data could not be applied safely. Reload the page before editing.",
}

const isFatalSyncErrorCode = (code: unknown): code is Exclude<DocCollaborationSyncErrorCode, "sync_apply_failed"> =>
  code === "invalid_update" || code === "update_too_large" || code === "resync_required"

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
  const [syncError, setSyncError] = useState<DocCollaborationSyncError | null>(null)
  const [hasRemoteContent, setHasRemoteContent] = useState(false)
  const [initialSyncComplete, setInitialSyncComplete] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const pendingMessages = useRef<string[]>([])
  const unacknowledgedDocUpdates = useRef<string[]>([])
  const isCleanedUp = useRef(false)
  const hasFatalErrorRef = useRef(false)
  const initialSyncCompleteRef = useRef(false)
  const latestServerSeqRef = useRef(0)
  const pendingAwarenessUpdatesRef = useRef<Uint8Array[]>([])
  const onLocalChangeRef = useRef(options.onLocalChange)

  useEffect(() => {
    onLocalChangeRef.current = options.onLocalChange
  }, [options.onLocalChange])

  const sendMessage = (message: Record<string, unknown>) => {
    if (hasFatalErrorRef.current) return

    const payload = JSON.stringify(message)
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN && initialSyncCompleteRef.current) {
      socket.send(payload)
    } else {
      pendingMessages.current.push(payload)
    }
  }

  const sendSnapshot = () => {
    if (hasFatalErrorRef.current) return

    const snapshot = encodeBase64(Y.encodeStateAsUpdate(ydoc))
    sendMessage({
      type: "doc.snapshot",
      snapshot,
      seq: latestServerSeqRef.current,
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
    hasFatalErrorRef.current = false
    initialSyncCompleteRef.current = false
    latestServerSeqRef.current = 0
    pendingAwarenessUpdatesRef.current = []
    pendingMessages.current = []
    unacknowledgedDocUpdates.current = []
    setSyncError(null)
    setInitialSyncComplete(false)
    setHasRemoteContent(false)

    const connect = () => {
      if (isCleanedUp.current || hasFatalErrorRef.current) return

      reconnectRef.current = null
      initialSyncCompleteRef.current = false
      setInitialSyncComplete(false)
      const socket = new WebSocket(getWsUrl(docId))
      socketRef.current = socket
      setSyncState("connecting")

      socket.onopen = () => {
        // Don't proceed if cleaned up during connection
        if (isCleanedUp.current || hasFatalErrorRef.current) {
          socket.close()
          return
        }
      }

      const failSync = (code: DocCollaborationSyncErrorCode) => {
        if (hasFatalErrorRef.current) return

        hasFatalErrorRef.current = true
        initialSyncCompleteRef.current = false
        pendingMessages.current = []
        unacknowledgedDocUpdates.current = []
        pendingAwarenessUpdatesRef.current = []
        if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
        reconnectRef.current = null
        setInitialSyncComplete(false)
        setSyncState("error")
        setSyncError({ code, message: FATAL_SYNC_ERROR_MESSAGES[code], requiresReload: true })
        socket.close()
      }

      socket.onclose = (event) => {
        if (isCleanedUp.current || hasFatalErrorRef.current) return
        if (event.code === 1009) {
          failSync("update_too_large")
          return
        }
        initialSyncCompleteRef.current = false
        setInitialSyncComplete(false)
        setSyncState("error")
        if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
        reconnectRef.current = window.setTimeout(() => connect(), 1000)
      }

      socket.onmessage = (event) => {
        if (socketRef.current !== socket || hasFatalErrorRef.current || typeof event.data !== "string") return
        let message: ServerMessage
        try {
          message = JSON.parse(event.data) as ServerMessage
        } catch {
          return
        }

        const applyDocumentUpdate = (update: string) => {
          try {
            Y.applyUpdate(ydoc, decodeBase64(update), "remote")
            return true
          } catch {
            failSync("sync_apply_failed")
            return false
          }
        }

        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", ts: message.ts }))
          return
        }

        if (message.type === "doc.sync") {
          const snapshot = typeof message.snapshot === "string" ? message.snapshot : null
          const updates = Array.isArray(message.updates) ? message.updates : []
          const latestSeq = typeof message.latestSeq === "number" ? message.latestSeq : 0
          if (snapshot && !applyDocumentUpdate(snapshot)) {
            return
          }
          for (const update of updates) {
            if (typeof update === "string") {
              if (!applyDocumentUpdate(update)) return
            }
          }
          latestServerSeqRef.current = latestSeq
          setHasRemoteContent(Boolean(snapshot) || updates.length > 0)
          initialSyncCompleteRef.current = true
          for (const update of pendingAwarenessUpdatesRef.current) {
            try {
              applyAwarenessUpdate(awareness, update, "remote")
            } catch {
              // Invalid presence data does not affect the document state.
            }
          }
          pendingAwarenessUpdatesRef.current = []
          setInitialSyncComplete(true)
          setSyncState("synced")
          setSyncError(null)
          const queued = pendingMessages.current
          pendingMessages.current = []
          for (let index = 0; index < queued.length; index += 1) {
            try {
              socket.send(queued[index]!)
            } catch {
              pendingMessages.current = queued.slice(index)
              socket.close()
              return
            }
          }
          for (const update of unacknowledgedDocUpdates.current) {
            try {
              socket.send(update)
            } catch {
              socket.close()
              return
            }
          }
          const localAwarenessUpdate = encodeAwarenessUpdate(awareness, [ydoc.clientID])
          sendMessage({ type: "presence.update", update: encodeBase64(localAwarenessUpdate) })
          return
        }

        if (message.type === "doc.update" && typeof message.update === "string") {
          if (typeof message.seq === "number") {
            latestServerSeqRef.current = Math.max(latestServerSeqRef.current, message.seq)
          }
          applyDocumentUpdate(message.update)
          return
        }

        if (message.type === "doc.ack" && typeof message.seq === "number") {
          latestServerSeqRef.current = Math.max(latestServerSeqRef.current, message.seq)
          unacknowledgedDocUpdates.current.shift()
          return
        }

        if (message.type === "presence.broadcast" && typeof message.update === "string") {
          let update: Uint8Array
          try {
            update = decodeBase64(message.update)
          } catch {
            return
          }
          if (!initialSyncCompleteRef.current) {
            pendingAwarenessUpdatesRef.current.push(update)
            return
          }

          try {
            applyAwarenessUpdate(awareness, update, "remote")
          } catch {
            // Invalid presence data does not affect the document state.
          }
          return
        }

        if (message.type === "error" && isFatalSyncErrorCode(message.code)) {
          failSync(message.code)
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
      if (initialSyncCompleteRef.current) {
        sendSnapshot()
      }
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
      onLocalChangeRef.current?.()
      const payload = JSON.stringify({ type: "doc.update", update: encodeBase64(update) })
      unacknowledgedDocUpdates.current.push(payload)
      const socket = socketRef.current
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(payload)
        } catch {
          socket.close()
        }
      }
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

  return { ydoc, awareness, syncState, syncError, hasRemoteContent, initialSyncComplete, sendSnapshot }
}
