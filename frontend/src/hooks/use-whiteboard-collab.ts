import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collaborator } from "@excalidraw/excalidraw/types"

type WhiteboardElement = {
  id: string
  version?: number
  isDeleted?: boolean
  [key: string]: unknown
}

type WhiteboardFiles = Record<string, unknown>

export type WhiteboardSceneUpdate = {
  elements: readonly WhiteboardElement[]
  files?: WhiteboardFiles
}

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
}

type ServerMessage =
  | WhiteboardSyncMessage
  | WhiteboardUpdateMessage
  | WhiteboardPresenceMessage
  | WhiteboardJoinMessage
  | WhiteboardLeaveMessage
  | WhiteboardSnapshotRequestMessage

type ClientMessage =
  | { type: "whiteboard.update"; update: WhiteboardSceneUpdate }
  | { type: "whiteboard.presence"; update: WhiteboardPresenceMessage["update"] }
  | { type: "whiteboard.snapshot"; snapshot: WhiteboardSceneUpdate }

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
  onSync: (payload: WhiteboardSyncMessage) => void
  onRemoteUpdate: (payload: WhiteboardUpdateMessage) => void
  getSnapshot: () => WhiteboardSceneUpdate | null
}

export function useWhiteboardCollab({
  whiteboardId,
  currentUser,
  onSync,
  onRemoteUpdate,
  getSnapshot,
}: UseWhiteboardCollabOptions) {
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting")
  const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)
  const currentUserRef = useRef(currentUser)
  const onSyncRef = useRef(onSync)
  const onRemoteUpdateRef = useRef(onRemoteUpdate)
  const getSnapshotRef = useRef(getSnapshot)

  currentUserRef.current = currentUser
  onSyncRef.current = onSync
  onRemoteUpdateRef.current = onRemoteUpdate
  getSnapshotRef.current = getSnapshot

  const wsUrl = useMemo(() => {
    if (!whiteboardId) return ""
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    return `${protocol}://${window.location.host}/api/v1/collab/whiteboards/${whiteboardId}`
  }, [whiteboardId])

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const sendUpdate = useCallback(
    (update: WhiteboardSceneUpdate) => sendMessage({ type: "whiteboard.update", update }),
    [sendMessage]
  )

  const sendPresence = useCallback(
    (update: WhiteboardPresenceMessage["update"]) =>
      sendMessage({ type: "whiteboard.presence", update }),
    [sendMessage]
  )

  useEffect(() => {
    if (!wsUrl) return
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    setStatus("connecting")

    const send = (message: ClientMessage) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message))
      }
    }

    ws.addEventListener("open", () => {
      setStatus("open")
    })

    ws.addEventListener("close", () => {
      setStatus("closed")
    })

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      let message: ServerMessage | null = null
      try {
        message = JSON.parse(event.data) as ServerMessage
      } catch {
        return
      }

      if (message.type === "whiteboard.sync") {
        const next = new Map<string, Collaborator>()
        const activeUser = currentUserRef.current
        for (const collaborator of message.collaborators) {
          next.set(
            collaborator.id,
            updateCollaborator(
              next.get(collaborator.id),
              collaborator,
              collaborator.id === activeUser?.id
            )
          )
        }
        if (activeUser) {
          next.set(
            activeUser.id,
            updateCollaborator(next.get(activeUser.id), activeUser, true)
          )
        }
        setCollaborators(next)
        onSyncRef.current(message)
        return
      }

      if (message.type === "whiteboard.update") {
        onRemoteUpdateRef.current(message)
        return
      }

      if (message.type === "whiteboard.presence") {
        setCollaborators((prev) => {
          const next = new Map(prev)
          const existing = next.get(message.user.id)
          const pointer = message.update.pointer
            ? { ...message.update.pointer, tool: message.update.pointer.tool ?? "pointer" }
            : undefined
          const activeUser = currentUserRef.current
          next.set(
            message.user.id,
            updateCollaborator(existing, message.user, message.user.id === activeUser?.id, {
              pointer,
              button: message.update.button,
            })
          )
          return next
        })
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
          send({ type: "whiteboard.snapshot", snapshot })
        }
      }
    })

    return () => {
      ws.close()
    }
  }, [wsUrl])

  return {
    status,
    collaborators,
    sendUpdate,
    sendPresence,
  }
}
