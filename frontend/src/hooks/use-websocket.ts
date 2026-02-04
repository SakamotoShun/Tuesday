import { useCallback, useEffect, useState } from "react"
import { useAuthStore } from "@/store/auth-store"

type WSMessage = Record<string, unknown>
type MessageListener = (message: WSMessage) => void
type StatusListener = (connected: boolean) => void

const messageListeners = new Set<MessageListener>()
const statusListeners = new Set<StatusListener>()
const subscriptions = new Set<string>()
let socket: WebSocket | null = null
let isConnected = false
let isConnecting = false
let reconnectTimer: number | null = null
let pending: string[] = []
let shouldReconnect = true

const getWsUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws"
  return `${protocol}://${window.location.host}/api/v1/ws`
}

const notifyStatus = (connected: boolean) => {
  isConnected = connected
  statusListeners.forEach((listener) => listener(connected))
}

const connect = () => {
  if (socket || isConnecting) return
  if (!shouldReconnect) return

  isConnecting = true
  const ws = new WebSocket(getWsUrl())
  socket = ws

  ws.onopen = () => {
    isConnecting = false
    notifyStatus(true)
    const queued = pending
    pending = []
    queued.forEach((message) => ws.send(message))
    if (subscriptions.size > 0) {
      subscriptions.forEach((channelId) => {
        ws.send(JSON.stringify({ type: "subscribe", channelId }))
      })
    }
  }

  ws.onclose = () => {
    socket = null
    isConnecting = false
    notifyStatus(false)
    if (!shouldReconnect) return
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => connect(), 1500)
  }

  ws.onmessage = (event) => {
    if (typeof event.data !== "string") return
    let payload: WSMessage
    try {
      payload = JSON.parse(event.data) as WSMessage
    } catch {
      return
    }
    messageListeners.forEach((listener) => listener(payload))
  }
}

const disconnect = () => {
  shouldReconnect = false
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  reconnectTimer = null
  subscriptions.clear()
  pending = []
  if (socket) {
    socket.close()
    socket = null
  }
  isConnecting = false
  notifyStatus(false)
}

const send = (message: Record<string, unknown>) => {
  const payload = JSON.stringify(message)
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(payload)
  } else {
    pending.push(payload)
    connect()
  }
}

const onMessage = (listener: MessageListener) => {
  messageListeners.add(listener)
  return () => {
    messageListeners.delete(listener)
  }
}

const onStatusChange = (listener: StatusListener) => {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

export function useWebSocket() {
  const user = useAuthStore((state) => state.user)
  const [connected, setConnected] = useState(isConnected)

  useEffect(() => {
    const unsubscribe = onStatusChange(setConnected)
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user) {
      shouldReconnect = true
      connect()
    } else {
      disconnect()
    }
  }, [user?.id])

  const subscribe = useCallback((channelId: string) => {
    subscriptions.add(channelId)
    send({ type: "subscribe", channelId })
  }, [send])

  const unsubscribe = useCallback((channelId: string) => {
    subscriptions.delete(channelId)
    send({ type: "unsubscribe", channelId })
  }, [send])

  const sendTyping = useCallback((channelId: string, isTyping: boolean) => {
    send({ type: "typing", channelId, isTyping })
  }, [send])

  return {
    isConnected: connected,
    send,
    subscribe,
    unsubscribe,
    sendTyping,
    onMessage,
  }
}
