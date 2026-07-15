import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collaborator } from "@excalidraw/excalidraw/types"
import {
  isWhiteboardScene,
  type WhiteboardScene,
} from "@/lib/whiteboard-scene"

const PRESENCE_THROTTLE_MS = 33
const UPDATE_DEBOUNCE_MS = 600
const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000]

export type WhiteboardSceneUpdate = WhiteboardScene

type CollaboratorUser = {
  id: string
  name: string
  avatarUrl?: string
}

type WhiteboardSyncMessage = {
  type: "whiteboard.sync"
  snapshot: WhiteboardSceneUpdate | null
  updates: WhiteboardSceneUpdate[]
  latestSeq: number
  collaborators: CollaboratorUser[]
}

type WhiteboardUpdateMessage = {
  type: "whiteboard.update"
  update: WhiteboardSceneUpdate
  seq: number
  actorId: string
}

type WhiteboardPresenceMessage = {
  type: "whiteboard.presence"
  user: CollaboratorUser
  update: {
    pointer?: {
      x: number
      y: number
      tool?: "pointer" | "laser"
      renderCursor?: boolean
      laserColor?: string
    }
    button?: "up" | "down"
  }
}

type WhiteboardJoinMessage = {
  type: "whiteboard.join"
  collaborator: CollaboratorUser
}

type WhiteboardLeaveMessage = {
  type: "whiteboard.leave"
  userId: string
}

type WhiteboardSnapshotRequestMessage = {
  type: "whiteboard.snapshot.request"
  seq: number
}

type WhiteboardAckMessage = {
  type: "whiteboard.ack"
  seq: number
}

type WhiteboardPingMessage = {
  type: "ping"
  ts?: number
}

type ServerMessage =
  | WhiteboardSyncMessage
  | WhiteboardUpdateMessage
  | WhiteboardPresenceMessage
  | WhiteboardJoinMessage
  | WhiteboardLeaveMessage
  | WhiteboardSnapshotRequestMessage
  | WhiteboardAckMessage
  | WhiteboardPingMessage
  | { type: "server.restart"; message?: string }
  | { type: "error"; code?: string; message?: string }

type ClientMessage =
  | { type: "whiteboard.update"; update: WhiteboardSceneUpdate }
  | { type: "whiteboard.presence"; update: WhiteboardPresenceMessage["update"] }
  | { type: "whiteboard.snapshot"; snapshot: WhiteboardSceneUpdate; seq: number }

const colorFromId = (id: string) => {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return {
    background: `hsl(${hue} 75% 88%)`,
    stroke: `hsl(${hue} 65% 45%)`,
  }
}

const buildCollaborator = (user: CollaboratorUser, isCurrentUser: boolean): Collaborator => ({
  id: user.id,
  username: user.name,
  avatarUrl: user.avatarUrl,
  color: colorFromId(user.id),
  isCurrentUser,
  socketId: user.id as Collaborator["socketId"],
})

const updateCollaborator = (
  current: Collaborator | undefined,
  user: CollaboratorUser,
  isCurrentUser: boolean,
  patch: Partial<Collaborator> = {}
) => ({
  ...(current ?? buildCollaborator(user, isCurrentUser)),
  ...patch,
})

type UseWhiteboardCollabOptions = {
  whiteboardId: string
  currentUser?: CollaboratorUser | null
  onSync: (payload: WhiteboardSyncMessage, pendingLocalUpdate: WhiteboardSceneUpdate | null) => void
  onRemoteUpdate: (payload: WhiteboardUpdateMessage) => void
  onAck?: (update: WhiteboardSceneUpdate, seq: number) => void
  getSnapshot: () => WhiteboardSceneUpdate | null
}

export function useWhiteboardCollab({
  whiteboardId,
  currentUser,
  onSync,
  onRemoteUpdate,
  onAck,
  getSnapshot,
}: UseWhiteboardCollabOptions) {
  const [status, setStatus] = useState<"connecting" | "open" | "reconnecting" | "closed">("connecting")
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)
  const currentUserRef = useRef(currentUser)
  const onSyncRef = useRef(onSync)
  const onRemoteUpdateRef = useRef(onRemoteUpdate)
  const onAckRef = useRef(onAck)
  const getSnapshotRef = useRef(getSnapshot)
  const hasSyncedConnectionRef = useRef(false)
  const queuedUpdateRef = useRef<WhiteboardSceneUpdate | null>(null)
  const inFlightUpdateRef = useRef<WhiteboardSceneUpdate | null>(null)
  const updateTimeoutRef = useRef<number | null>(null)
  const pendingPresenceRef = useRef<WhiteboardPresenceMessage["update"] | null>(null)
  const presenceTimeoutRef = useRef<number | null>(null)
  const lastPresenceSentAtRef = useRef(0)
  const pendingCollaboratorPresenceRef = useRef<
    Map<string, { user: CollaboratorUser; update: WhiteboardPresenceMessage["update"] }>
  >(new Map())
  const collaboratorFrameRef = useRef<number | null>(null)

  currentUserRef.current = currentUser
  onSyncRef.current = onSync
  onRemoteUpdateRef.current = onRemoteUpdate
  onAckRef.current = onAck
  getSnapshotRef.current = getSnapshot

  const wsUrl = useMemo(() => {
    if (!whiteboardId) return ""
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    return `${protocol}://${window.location.host}/api/v1/collab/whiteboards/${whiteboardId}`
  }, [whiteboardId])
  const draftStorageKey = useMemo(() => `whiteboard-draft:${whiteboardId}`, [whiteboardId])

  const persistDraft = useCallback((update: WhiteboardSceneUpdate | null) => {
    try {
      if (update) {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(update))
      } else {
        window.localStorage.removeItem(draftStorageKey)
      }
    } catch {
      // Large image-heavy scenes can exceed browser storage. The in-memory queue still retries them.
    }
  }, [draftStorageKey])

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false
    wsRef.current.send(JSON.stringify(message))
    return true
  }, [])

  const flushQueuedUpdate = useCallback(() => {
    if (
      !hasSyncedConnectionRef.current
      || inFlightUpdateRef.current
      || !queuedUpdateRef.current
      || wsRef.current?.readyState !== WebSocket.OPEN
    ) return

    const update = queuedUpdateRef.current
    queuedUpdateRef.current = null
    inFlightUpdateRef.current = update

    try {
      wsRef.current.send(JSON.stringify({ type: "whiteboard.update", update }))
    } catch {
      inFlightUpdateRef.current = null
      queuedUpdateRef.current = update
      setError("Whiteboard changes could not be sent. Reconnecting...")
    }
  }, [])

  const flushPresence = useCallback((force = false) => {
    const pending = pendingPresenceRef.current
    if (!pending) return

    const now = Date.now()
    const elapsed = now - lastPresenceSentAtRef.current

    if (!force && elapsed < PRESENCE_THROTTLE_MS) {
      if (presenceTimeoutRef.current) window.clearTimeout(presenceTimeoutRef.current)
      presenceTimeoutRef.current = window.setTimeout(() => {
        presenceTimeoutRef.current = null
        flushPresence(true)
      }, PRESENCE_THROTTLE_MS - elapsed)
      return
    }

    if (sendMessage({ type: "whiteboard.presence", update: pending })) {
      lastPresenceSentAtRef.current = now
      pendingPresenceRef.current = null
    }
    if (presenceTimeoutRef.current) {
      window.clearTimeout(presenceTimeoutRef.current)
      presenceTimeoutRef.current = null
    }
  }, [sendMessage])

  const flushCollaboratorPresence = useCallback(() => {
    collaboratorFrameRef.current = null
    const pendingEntries = Array.from(pendingCollaboratorPresenceRef.current.values())
    pendingCollaboratorPresenceRef.current.clear()
    if (pendingEntries.length === 0) return

    setCollaborators((prev) => {
      const next = new Map(prev)
      const activeUser = currentUserRef.current
      for (const entry of pendingEntries) {
        const existing = next.get(entry.user.id)
        const pointer = entry.update.pointer
          ? { ...entry.update.pointer, tool: entry.update.pointer.tool ?? "pointer" }
          : undefined
        next.set(
          entry.user.id,
          updateCollaborator(existing, entry.user, entry.user.id === activeUser?.id, {
            pointer,
            button: entry.update.button,
          })
        )
      }
      return next
    })
  }, [])

  const sendUpdate = useCallback((update: WhiteboardSceneUpdate) => {
    queuedUpdateRef.current = update
    persistDraft(update)
    setIsSaving(true)
    setError(null)

    if (updateTimeoutRef.current !== null) window.clearTimeout(updateTimeoutRef.current)
    updateTimeoutRef.current = window.setTimeout(() => {
      updateTimeoutRef.current = null
      flushQueuedUpdate()
    }, UPDATE_DEBOUNCE_MS)
  }, [flushQueuedUpdate, persistDraft])

  const sendPresence = useCallback((update: WhiteboardPresenceMessage["update"]) => {
    pendingPresenceRef.current = update
    flushPresence(update.button !== undefined)
  }, [flushPresence])

  useEffect(() => {
    if (!wsUrl) return

    let disposed = false
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0

    queuedUpdateRef.current = null
    inFlightUpdateRef.current = null
    hasSyncedConnectionRef.current = false
    setIsReady(false)
    setIsSaving(false)
    setError(null)

    try {
      const storedDraft = JSON.parse(window.localStorage.getItem(draftStorageKey) ?? "null") as unknown
      if (isWhiteboardScene(storedDraft)) {
        queuedUpdateRef.current = storedDraft
        setIsSaving(true)
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey)
    }

    const connect = () => {
      if (disposed) return
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      hasSyncedConnectionRef.current = false
      setStatus(reconnectAttempt === 0 ? "connecting" : "reconnecting")

      ws.addEventListener("open", () => {
        if (wsRef.current !== ws) return
        setError(null)
      })

      ws.addEventListener("close", (event) => {
        if (wsRef.current !== ws || disposed) return
        hasSyncedConnectionRef.current = false

        if (inFlightUpdateRef.current && !queuedUpdateRef.current) {
          queuedUpdateRef.current = inFlightUpdateRef.current
          persistDraft(inFlightUpdateRef.current)
        }
        inFlightUpdateRef.current = null

        if (event.code === 1008 || event.code === 1009) {
          setStatus("closed")
          setError(event.code === 1009
            ? "This whiteboard is too large to sync. Ask an administrator to increase WHITEBOARD_MAX_MESSAGE_MB."
            : event.reason || "Whiteboard access was denied.")
          return
        }

        if (reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
          setStatus("closed")
          setError("Whiteboard connection was lost. Reload to retry.")
          return
        }

        const delay = RECONNECT_DELAYS_MS[reconnectAttempt] ?? RECONNECT_DELAYS_MS.at(-1)!
        reconnectAttempt += 1
        setStatus("reconnecting")
        reconnectTimer = window.setTimeout(connect, delay)
      })

      ws.addEventListener("message", (event) => {
        if (wsRef.current !== ws || typeof event.data !== "string") return
        let message: ServerMessage
        try {
          message = JSON.parse(event.data) as ServerMessage
        } catch {
          return
        }

        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: message.ts }))
          return
        }

        if (message.type === "whiteboard.sync") {
          pendingCollaboratorPresenceRef.current.clear()
          if (collaboratorFrameRef.current !== null) {
            cancelAnimationFrame(collaboratorFrameRef.current)
            collaboratorFrameRef.current = null
          }
          const next = new Map<string, Collaborator>()
          const activeUser = currentUserRef.current
          for (const collaborator of message.collaborators) {
            next.set(
              collaborator.id,
              updateCollaborator(next.get(collaborator.id), collaborator, collaborator.id === activeUser?.id)
            )
          }
          if (activeUser) {
            next.set(activeUser.id, updateCollaborator(next.get(activeUser.id), activeUser, true))
          }
          setCollaborators(next)

          const pendingLocalUpdate = queuedUpdateRef.current ?? inFlightUpdateRef.current
          onSyncRef.current(message, pendingLocalUpdate)
          hasSyncedConnectionRef.current = true
          reconnectAttempt = 0
          setIsReady(true)
          setStatus("open")
          setError(null)
          flushQueuedUpdate()
          return
        }

        if (message.type === "whiteboard.ack") {
          const acknowledgedUpdate = inFlightUpdateRef.current
          if (!acknowledgedUpdate) return
          inFlightUpdateRef.current = null
          onAckRef.current?.(acknowledgedUpdate, message.seq)

          if (queuedUpdateRef.current) {
            persistDraft(queuedUpdateRef.current)
            flushQueuedUpdate()
          } else {
            persistDraft(null)
            setIsSaving(false)
          }
          return
        }

        if (message.type === "whiteboard.update") {
          onRemoteUpdateRef.current(message)
          return
        }

        if (message.type === "whiteboard.presence") {
          pendingCollaboratorPresenceRef.current.set(message.user.id, {
            user: message.user,
            update: message.update,
          })
          if (collaboratorFrameRef.current === null) {
            collaboratorFrameRef.current = requestAnimationFrame(flushCollaboratorPresence)
          }
          return
        }

        if (message.type === "whiteboard.join") {
          setCollaborators((prev) => {
            const next = new Map(prev)
            const activeUser = currentUserRef.current
            next.set(
              message.collaborator.id,
              updateCollaborator(
                next.get(message.collaborator.id),
                message.collaborator,
                message.collaborator.id === activeUser?.id
              )
            )
            return next
          })
          return
        }

        if (message.type === "whiteboard.leave") {
          setCollaborators((prev) => {
            const next = new Map(prev)
            next.delete(message.userId)
            return next
          })
          return
        }

        if (message.type === "whiteboard.snapshot.request") {
          const snapshot = getSnapshotRef.current()
          if (snapshot) {
            sendMessage({ type: "whiteboard.snapshot", snapshot, seq: message.seq })
          }
          return
        }

        if (message.type === "error") {
          setError(message.message || "The whiteboard server rejected an update.")
        }
      })
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      if (presenceTimeoutRef.current !== null) {
        window.clearTimeout(presenceTimeoutRef.current)
        presenceTimeoutRef.current = null
      }
      if (collaboratorFrameRef.current !== null) {
        cancelAnimationFrame(collaboratorFrameRef.current)
        collaboratorFrameRef.current = null
      }

      const ws = wsRef.current
      if (queuedUpdateRef.current && ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "whiteboard.update", update: queuedUpdateRef.current }))
        } catch {
          // The local draft remains available for the next mount.
        }
      }

      pendingCollaboratorPresenceRef.current.clear()
      pendingPresenceRef.current = null
      inFlightUpdateRef.current = null
      queuedUpdateRef.current = null
      wsRef.current = null
      ws?.close()
    }
  }, [draftStorageKey, flushCollaboratorPresence, flushQueuedUpdate, persistDraft, sendMessage, wsUrl])

  return {
    status,
    isReady,
    isSaving,
    error,
    collaborators,
    sendUpdate,
    sendPresence,
  }
}
