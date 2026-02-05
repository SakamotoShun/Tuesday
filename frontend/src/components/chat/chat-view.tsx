import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ProjectMember, User } from "@/api/types"
import * as projectsApi from "@/api/projects"
import { usersApi } from "@/api/users"
import { useAuth } from "@/hooks/use-auth"
import { useChatChannels, useChatMessages } from "@/hooks/use-chat"
import { useWebSocket } from "@/hooks/use-websocket"
import { useChatStore } from "@/store/chat-store"
import { ChannelList } from "@/components/chat/channel-list"
import { ChannelSettingsDialog } from "@/components/chat/channel-settings-dialog"
import { MessageList } from "@/components/chat/message-list"
import { MessageInput } from "@/components/chat/message-input"
import { TypingIndicator } from "@/components/chat/typing-indicator"
import { NewChannelDialog } from "@/components/chat/new-channel-dialog"
import { Badge } from "@/components/ui/badge"

interface ChatViewProps {
  projectId?: string
  title?: string
  variant?: "page" | "panel"
}

const mapMembers = (members?: ProjectMember[]): User[] =>
  members
    ?.map((member) => member.user)
    .filter((user): user is User => Boolean(user)) ?? []

export function ChatView({ projectId, title, variant = "page" }: ChatViewProps) {
  const isPanel = variant === "panel"
  const { user } = useAuth()
  const { isConnected } = useWebSocket()
  const [searchParams] = useSearchParams()
  const { activeChannelId, setActiveChannelId } = useChatStore()
  const { channels, isLoading, updateChannel, archiveChannel } = useChatChannels(activeChannelId)

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

  const mentionableQuery = useQuery({
    queryKey: ["users", "mentionable"],
    queryFn: usersApi.listMentionable,
    enabled: activeChannel?.type === "workspace",
  })

  const members = activeChannel?.type === "workspace"
    ? (mentionableQuery.data ?? [])
    : mapMembers(membersQuery.data)
  const currentMemberRole = membersQuery.data?.find((member) => member.userId === user?.id)?.role

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
  const isArchived = Boolean(activeChannel?.archivedAt)
  const canManageChannel = Boolean(
    activeChannel &&
      (user?.role === "admin" || (activeChannel.projectId && currentMemberRole === "owner"))
  )

  return (
    <div className={
      isPanel
        ? "flex flex-col h-full min-h-0 overflow-hidden bg-card"
        : "flex flex-col md:flex-row flex-1 min-h-0 border border-border rounded-lg overflow-hidden bg-card"
    }>
      <aside className={
        isPanel
          ? "border-b border-border bg-background flex-shrink-0"
          : "w-full md:w-72 border-b md:border-b-0 md:border-r border-border bg-background min-h-0"
      }>
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
        <div className={
          isPanel
            ? "py-2 overflow-y-auto max-h-[120px]"
            : "py-3 overflow-y-auto max-h-[240px] md:max-h-none md:h-full"
        }>
          <ChannelList
            channels={filteredChannels}
            activeChannelId={activeChannel?.id ?? null}
            onSelect={setActiveChannelId}
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-border px-4 py-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">
                {activeChannel ? `# ${activeChannel.name}` : "Select a channel"}
              </div>
              {activeChannel?.project && !isPanel && (
                <div className="text-xs text-muted-foreground">{activeChannel.project.name}</div>
              )}
              {activeChannel?.description && (
                <div className="text-xs text-muted-foreground mt-1">{activeChannel.description}</div>
              )}
            </div>
            {activeChannel && canManageChannel && (
              <ChannelSettingsDialog
                channel={activeChannel}
                canManage={canManageChannel}
                onUpdate={(input) => updateChannel.mutateAsync({ channelId: activeChannel.id, data: input })}
                onArchive={() => archiveChannel.mutateAsync(activeChannel.id)}
              />
            )}
          </div>
        </div>
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {activeChannel ? (
            <MessageList
              messages={messages.messages}
              isLoading={messages.isLoading}
              hasNextPage={messages.hasNextPage}
              isFetchingNextPage={messages.isFetchingNextPage}
              onLoadMore={() => messages.fetchNextPage()}
              currentUserId={user?.id}
              currentUserRole={user?.role}
              onUpdateMessage={
                isArchived
                  ? undefined
                  : (messageId, content) => messages.updateMessage.mutateAsync({ messageId, content })
              }
              onDeleteMessage={
                isArchived
                  ? undefined
                  : (messageId) => messages.deleteMessage.mutateAsync({ messageId })
              }
              onAddReaction={
                isArchived
                  ? undefined
                  : (messageId, emoji) => messages.addReaction.mutateAsync({ messageId, emoji })
              }
              onRemoveReaction={
                isArchived
                  ? undefined
                  : (messageId, emoji) => messages.removeReaction.mutateAsync({ messageId, emoji })
              }
            />
          ) : (
            <div className="text-sm text-muted-foreground">Choose a channel to start chatting.</div>
          )}
        </div>
        <div className="border-t border-border p-4 space-y-2 flex-shrink-0">
          <TypingIndicator users={messages.typingUsers} />
          <MessageInput
            onSend={(payload) => {
              if (!activeChannel) return
              return messages.sendMessage.mutateAsync(payload)
            }}
            onTyping={(isTyping) => {
              if (activeChannel?.id) {
                messages.sendTyping(activeChannel.id, isTyping)
              }
            }}
            members={members}
            disabled={isArchived}
          />
        </div>
      </main>
    </div>
  )
}
