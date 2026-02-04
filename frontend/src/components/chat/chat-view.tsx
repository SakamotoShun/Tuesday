import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ProjectMember, User } from "@/api/types"
import * as projectsApi from "@/api/projects"
import { useAuth } from "@/hooks/use-auth"
import { useChatChannels, useChatMessages } from "@/hooks/use-chat"
import { useWebSocket } from "@/hooks/use-websocket"
import { useChatStore } from "@/store/chat-store"
import { ChannelList } from "@/components/chat/channel-list"
import { MessageList } from "@/components/chat/message-list"
import { MessageInput } from "@/components/chat/message-input"
import { TypingIndicator } from "@/components/chat/typing-indicator"
import { NewChannelDialog } from "@/components/chat/new-channel-dialog"
import { Badge } from "@/components/ui/badge"

interface ChatViewProps {
  projectId?: string
  title?: string
}

const mapMembers = (members?: ProjectMember[]): User[] =>
  members
    ?.map((member) => member.user)
    .filter((user): user is User => Boolean(user)) ?? []

export function ChatView({ projectId, title }: ChatViewProps) {
  const { user } = useAuth()
  const { isConnected } = useWebSocket()
  const [searchParams] = useSearchParams()
  const { activeChannelId, setActiveChannelId } = useChatStore()
  const { channels, isLoading } = useChatChannels(activeChannelId)

  const filteredChannels = useMemo(() => {
    if (!projectId) return channels
    return channels.filter((channel) => channel.projectId === projectId)
  }, [channels, projectId])

  const activeChannel = filteredChannels.find((channel) => channel.id === activeChannelId) ?? null

  const messages = useChatMessages(activeChannel?.id)

  const membersQuery = useQuery({
    queryKey: ["projects", activeChannel?.projectId, "members"],
    queryFn: () =>
      activeChannel?.projectId ? projectsApi.getMembers(activeChannel.projectId) : Promise.resolve([]),
    enabled: Boolean(activeChannel?.projectId),
  })

  const members = mapMembers(membersQuery.data)

  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!activeChannel && filteredChannels.length > 0) {
      const firstChannel = filteredChannels[0]
      if (firstChannel) {
        setActiveChannelId(firstChannel.id)
      }
    }
  }, [activeChannel, filteredChannels, setActiveChannelId])

  useEffect(() => {
    const channelParam = searchParams.get("channel")
    if (channelParam) {
      setActiveChannelId(channelParam)
    }
  }, [searchParams, setActiveChannelId])

  useEffect(() => {
    if (activeChannel?.id) {
      messages.markRead.mutate()
    }
  }, [activeChannel?.id])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.messages.length])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading chat...</div>
  }

  const canCreateChannel = projectId ? true : user?.role === "admin"

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-320px)] min-h-[520px] border border-border rounded-lg overflow-hidden bg-card">
      <aside className="w-full md:w-72 border-b md:border-b-0 md:border-r border-border bg-background">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-semibold">{title ?? "Channels"}</div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "secondary" : "outline"}>
              {isConnected ? "Online" : "Offline"}
            </Badge>
            {canCreateChannel && (
              <NewChannelDialog
                projectId={projectId}
                onCreated={(id) => setActiveChannelId(id)}
              />
            )}
          </div>
        </div>
        <div className="py-3 overflow-y-auto max-h-[240px] md:max-h-none md:h-full">
          <ChannelList
            channels={filteredChannels}
            activeChannelId={activeChannel?.id ?? null}
            onSelect={setActiveChannelId}
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">
            {activeChannel ? `# ${activeChannel.name}` : "Select a channel"}
          </div>
          {activeChannel?.project && (
            <div className="text-xs text-muted-foreground">{activeChannel.project.name}</div>
          )}
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {activeChannel ? (
            <MessageList
              messages={messages.messages}
              isLoading={messages.isLoading}
              hasNextPage={messages.hasNextPage}
              isFetchingNextPage={messages.isFetchingNextPage}
              onLoadMore={() => messages.fetchNextPage()}
              currentUserId={user?.id}
            />
          ) : (
            <div className="text-sm text-muted-foreground">Choose a channel to start chatting.</div>
          )}
        </div>
        <div className="border-t border-border p-4 space-y-2">
          <TypingIndicator users={messages.typingUsers} />
          <MessageInput
            onSend={(content) => {
              if (!activeChannel) return
              messages.sendMessage.mutate(content)
            }}
            onTyping={(isTyping) => {
              if (activeChannel?.id) {
                messages.sendTyping(activeChannel.id, isTyping)
              }
            }}
            members={members}
          />
        </div>
      </main>
    </div>
  )
}
