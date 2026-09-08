import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWebSocket } from "@/hooks/use-websocket"

export function RealtimeQuerySync() {
  const queryClient = useQueryClient()
  const { isConnected } = useWebSocket()
  useEffect(() => {
    if (!isConnected) return
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
    queryClient.invalidateQueries({ queryKey: ["channels"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }, [isConnected, queryClient])

  return null
}
