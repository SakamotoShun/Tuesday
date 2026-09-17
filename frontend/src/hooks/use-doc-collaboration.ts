import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  pendingUpdateCount: number
}

type ServerMessage =
  | { type: "ping"; ts?: unknown }
  | { type: "doc.sync"; snapshot?: unknown; updates?: unknown; latestSeq?: unknown; generation?: unknown; acknowledgement?: unknown; persistence?: unknown }
  | { type: "doc.update"; update?: unknown; seq?: unknown; generation?: unknown }
  | { type: "doc.ack"; seq?: unknown; generation?: unknown; operationId?: unknown }
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
  invalid_update: "A document update was rejected as invalid. Save a recovery copy of local work before reloading.",
  update_too_large: "A document update is too large to sync. Save a recovery copy of local work before reloading.",
  resync_required: "This document must be resynchronized. Save a recovery copy of local work before reloading.",
  sync_apply_failed: "The document sync data could not be applied safely. Save a recovery copy of local work before reloading.",
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
  const acknowledgementTimeoutRef = useRef<number | null>(null)
  const snapshotPendingRef = useRef(false)
  const requestedSnapshotSeqRef = useRef(0)
  const unacknowledgedDocUpdates = useRef<Array<{ operationId: string; payload: string; sentAt: number | null }>>([])
  const operationAcknowledgementsRef = useRef(false)
  const hasFatalErrorRef = useRef(false)
  const initialSyncCompleteRef = useRef(false)
  const hasInitializedRef = useRef(false)
  const latestServerSeqRef = useRef(0)
  const generationRef = useRef<string | undefined>(undefined)
  const pendingAwarenessUpdatesRef = useRef<Uint8Array[]>([])
  const onLocalChangeRef = useRef(options.onLocalChange)
  const serverOwnedSavesRef = useRef(false)

  // Export only: never feed this old-generation state into a replacement history.
  const getRecoveryCopy = useCallback(() => ({
    format: "tuesday-doc-recovery-v1",
    docId,
    generation: generationRef.current ?? null,
    exportedAt: new Date().toISOString(),
    snapshot: encodeBase64(Y.encodeStateAsUpdate(ydoc)),
    pendingUpdates: unacknowledgedDocUpdates.current.map(({ operationId, payload }) => ({ operationId, payload })),
  }), [docId, ydoc])

  const clearAcknowledgementTimeout = useCallback(() => {
    if (acknowledgementTimeoutRef.current !== null) window.clearTimeout(acknowledgementTimeoutRef.current)
    acknowledgementTimeoutRef.current = null
  }, [])
  const awaitAcknowledgement = useCallback(() => {
    if (!operationAcknowledgementsRef.current || !unacknowledgedDocUpdates.current.length
      || acknowledgementTimeoutRef.current !== null || !initialSyncCompleteRef.current) return
    const oldest = unacknowledgedDocUpdates.current.find(update => update.sentAt !== null)
    if (!oldest || oldest.sentAt === null) return
    // A live socket can lose an application ACK. Reconnect recovers durable
    // content and retries the same operation IDs; it never invents new edits.
    // Newer ACKs cannot postpone an older operation's monotonic deadline.
    acknowledgementTimeoutRef.current = window.setTimeout(() => {
      acknowledgementTimeoutRef.current = null
      socketRef.current?.close()
    }, Math.max(0, oldest.sentAt + 10_000 - performance.now()))
  }, [])

  useEffect(() => {
    onLocalChangeRef.current = options.onLocalChange
  }, [options.onLocalChange])

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (hasFatalErrorRef.current) return

    const payload = JSON.stringify(message)
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN && initialSyncCompleteRef.current) {
      try {
        socket.send(payload)
      } catch {
        socket.close()
      }
    }
    // Presence is ephemeral; the full local state is sent after reconnect.
  }, [])

  const flushSnapshot = useCallback(() => {
    const socket = socketRef.current
    if (serverOwnedSavesRef.current || !snapshotPendingRef.current || hasFatalErrorRef.current
      || !initialSyncCompleteRef.current || socket?.readyState !== WebSocket.OPEN
      || unacknowledgedDocUpdates.current.length > 0
      || requestedSnapshotSeqRef.current > latestServerSeqRef.current) return

    const snapshot = encodeBase64(Y.encodeStateAsUpdate(ydoc))
    try {
      socket.send(JSON.stringify({ type: "doc.snapshot", snapshot, seq: latestServerSeqRef.current, generation: generationRef.current }))
      snapshotPendingRef.current = false
      requestedSnapshotSeqRef.current = 0
    } catch {
      socket.close()
    }
  }, [ydoc])

  const sendSnapshot = useCallback(() => {
    snapshotPendingRef.current = true
    flushSnapshot()
  }, [flushSnapshot])

  useEffect(() => {
    const name = user?.name ?? "Anonymous"
    const color = pickColor(user?.id ?? name)
    awareness.setLocalStateField("user", { name, color })
  }, [awareness, user?.id, user?.name])

  useEffect(() => {
    if (!docId) return undefined
    let disposed = false
    hasFatalErrorRef.current = false
    initialSyncCompleteRef.current = false
    hasInitializedRef.current = false
    latestServerSeqRef.current = 0
    generationRef.current = undefined
    operationAcknowledgementsRef.current = false
    serverOwnedSavesRef.current = false
    pendingAwarenessUpdatesRef.current = []
    snapshotPendingRef.current = false
    requestedSnapshotSeqRef.current = 0
    unacknowledgedDocUpdates.current = []
    setSyncError(null)
    setInitialSyncComplete(false)
    setHasRemoteContent(false)

    const connect = () => {
      if (disposed || hasFatalErrorRef.current) return

      reconnectRef.current = null
      initialSyncCompleteRef.current = false
      setInitialSyncComplete(false)
      const socket = new WebSocket(getWsUrl(docId))
      socketRef.current = socket
      setSyncState("connecting")

      socket.onopen = () => {
        // Don't proceed if cleaned up during connection
        if (disposed || socketRef.current !== socket || hasFatalErrorRef.current) {
          socket.close()
          return
        }
      }

      const failSync = (code: DocCollaborationSyncErrorCode) => {
        if (hasFatalErrorRef.current) return

        hasFatalErrorRef.current = true
        clearAcknowledgementTimeout()
        initialSyncCompleteRef.current = false
        // Keep pending local work in memory; a terminal error must not erase it.
        pendingAwarenessUpdatesRef.current = []
        if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
        reconnectRef.current = null
        setInitialSyncComplete(false)
        setSyncState("error")
        setSyncError({ code, message: FATAL_SYNC_ERROR_MESSAGES[code], requiresReload: true,
          pendingUpdateCount: unacknowledgedDocUpdates.current.length })
        socket.close()
      }

      socket.onclose = (event) => {
        if (disposed || socketRef.current !== socket || hasFatalErrorRef.current) return
        clearAcknowledgementTimeout()
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

      const completeSync = () => {
        initialSyncCompleteRef.current = true
        hasInitializedRef.current = true
        for (const update of pendingAwarenessUpdatesRef.current) {
          try { applyAwarenessUpdate(awareness, update, "remote") } catch { /* Ephemeral presence. */ }
        }
        pendingAwarenessUpdatesRef.current = []
        setInitialSyncComplete(true)
        setSyncState("synced")
        setSyncError(null)
        for (const update of unacknowledgedDocUpdates.current) {
          try { socket.send(update.payload); update.sentAt = performance.now() }
          catch { socket.close(); return }
        }
        awaitAcknowledgement()
        sendMessage({ type: "presence.update", update: encodeBase64(encodeAwarenessUpdate(awareness, [ydoc.clientID])) })
        flushSnapshot()
      }

      socket.onmessage = (event) => {
        if (disposed || socketRef.current !== socket || hasFatalErrorRef.current || typeof event.data !== "string") return
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
          const generation = typeof message.generation === "string" ? message.generation : undefined
          const operationAcknowledgements = message.acknowledgement === "operation_id"
          // Check before applying even one byte or replaying old pending work.
          if (hasInitializedRef.current && (generation !== generationRef.current
            || (operationAcknowledgementsRef.current && !operationAcknowledgements))) {
            failSync("resync_required")
            return
          }
          generationRef.current = generation
          operationAcknowledgementsRef.current = operationAcknowledgements
          serverOwnedSavesRef.current = message.persistence === "server"
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
          latestServerSeqRef.current = Math.max(latestServerSeqRef.current, latestSeq)
          setHasRemoteContent(Boolean(snapshot) || updates.length > 0)
          completeSync()
          return
        }

        if (message.type === "doc.update" && typeof message.update === "string") {
          if (message.generation !== generationRef.current) { failSync("resync_required"); return }
          if (!applyDocumentUpdate(message.update)) return
          if (typeof message.seq === "number") {
            latestServerSeqRef.current = Math.max(latestServerSeqRef.current, message.seq)
          }
          flushSnapshot()
          return
        }

        if (message.type === "doc.ack" && typeof message.seq === "number") {
          if (message.generation !== generationRef.current) { failSync("resync_required"); return }
          if (operationAcknowledgementsRef.current) {
            // A duplicate/foreign ACK must not consume another pending edit or
            // advance the snapshot watermark. Reconnect resends identical IDs.
            const index = unacknowledgedDocUpdates.current.findIndex(update => update.operationId === message.operationId)
            if (index < 0) return
            unacknowledgedDocUpdates.current.splice(index, 1)
            clearAcknowledgementTimeout()
            awaitAcknowledgement()
          } else {
            unacknowledgedDocUpdates.current.shift()
          }
          latestServerSeqRef.current = Math.max(latestServerSeqRef.current, message.seq)
          flushSnapshot()
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
            requestedSnapshotSeqRef.current = Math.max(requestedSnapshotSeqRef.current, message.seq)
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
      disposed = true
      clearAcknowledgementTimeout()
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
      reconnectRef.current = null
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      awareness.destroy()
      ydoc.destroy()
    }
  }, [awareness, docId, ydoc, sendMessage, sendSnapshot, flushSnapshot, clearAcknowledgementTimeout, awaitAcknowledgement])

  useEffect(() => {
    const queueDocUpdate = (update: Uint8Array) => {
      if (!hasInitializedRef.current || hasFatalErrorRef.current) return
      const operationId = crypto.randomUUID()
      const payload = JSON.stringify({ type: "doc.update", update: encodeBase64(update), generation: generationRef.current, operationId })
      const pending = { operationId, payload, sentAt: null as number | null }
      unacknowledgedDocUpdates.current.push(pending)
      const socket = socketRef.current
      if (socket?.readyState === WebSocket.OPEN && initialSyncCompleteRef.current) {
        try {
          socket.send(payload)
          pending.sentAt = performance.now()
          awaitAcknowledgement()
        } catch {
          socket.close()
        }
      }
      // Retain/send the update before invoking application callbacks.
      onLocalChangeRef.current?.()
    }
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || origin === "relay") return
      queueDocUpdate(update)
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
  }, [awareness, ydoc, sendMessage, awaitAcknowledgement])

  return { ydoc, awareness, syncState, syncError, hasRemoteContent, initialSyncComplete, sendSnapshot, getRecoveryCopy }
}
