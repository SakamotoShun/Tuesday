import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ChannelMember, ProjectMember, User } from "@/api/types"
import * as projectsApi from "@/api/projects"
import { usersApi } from "@/api/users"
import { chatApi } from "@/api/chat"
import { useAuth } from "@/hooks/use-auth"
import { useChatChannels, useChatMessages } from "@/hooks/use-chat"
import { useChannelMembers } from "@/hooks/use-channel-members"
import { useWebSocket } from "@/hooks/use-websocket"
import { useChatStore } from "@/store/chat-store"
import { ChannelList } from "@/components/chat/channel-list"
import { ChannelSettingsDialog } from "@/components/chat/channel-settings-dialog"
import { ChannelMembersDialog } from "@/components/chat/channel-members-dialog"
import { MessageList } from "@/components/chat/message-list"
import { MessageInput } from "@/components/chat/message-input"
import { TypingIndicator } from "@/components/chat/typing-indicator"
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

const mapChannelMembers = (members?: ChannelMember[]): User[] =>
  members
    ?.map((member) => member.user)
    .filter((user): user is User => Boolean(user)) ?? []

export function ChatView({ projectId, title, variant = "page" }: ChatViewProps) {
  const isPanel = variant === "panel"
  const { user } = useAuth()
  const { isConnected } = useWebSocket()
  const [searchParams] = useSearchParams()
  const { activeChannelId, setActiveChannelId } = useChatStore()
  const { channels, isLoading, updateChannel, archiveChannel, deleteChannel } = useChatChannels(activeChannelId)

  const filteredChannels = useMemo(() => {
    if (!projectId) return channels
    return channels.filter((channel) =>
      channel.type === "workspace" || channel.type === "dm" || channel.projectId === projectId
    )
  }, [channels, projectId])

  const activeChannel = filteredChannels.find((channel) => channel.id === activeChannelId) ?? null

  const messages = useChatMessages(activeChannel?.id)

  const channelMembers = useChannelMembers(
    activeChannel && (activeChannel.type === "dm" || activeChannel.access !== "public")
      ? activeChannel.id
      : null
  )

  const membersQuery = useQuery({
    queryKey: ["projects", activeChannel?.projectId, "members"],
    queryFn: () =>
      activeChannel?.projectId ? projectsApi.getMembers(activeChannel.projectId) : Promise.resolve([]),
    enabled: Boolean(activeChannel?.projectId),
  })

  const mentionableQuery = useQuery({
    queryKey: ["users", "mentionable"],
    queryFn: usersApi.listMentionable,
    enabled: activeChannel?.type === "workspace" && activeChannel?.access === "public",
  })

  const channelBotsQuery = useQuery({
    queryKey: ["channels", activeChannel?.id, "bots"],
    queryFn: () => activeChannel?.id ? chatApi.listChannelBots(activeChannel.id) : Promise.resolve([]),
    enabled: Boolean(activeChannel?.id) && activeChannel?.type !== "dm",
  })

  const members = activeChannel?.type === "dm" || activeChannel?.access !== "public"
    ? mapChannelMembers(channelMembers.members)
    : activeChannel?.type === "workspace"
      ? (mentionableQuery.data ?? [])
      : mapMembers(membersQuery.data)
  const currentMemberRole = membersQuery.data?.find((member) => member.userId === user?.id)?.role
  const currentChannelRole = channelMembers.members.find((member) => member.userId === user?.id)?.role

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

  const isArchived = Boolean(activeChannel?.archivedAt)
  const isDm = activeChannel?.type === "dm"
  const isPrivateChannel = Boolean(activeChannel && activeChannel.access !== "public")
  const canCreateWorkspaceChannel = Boolean(user) && !projectId
  const canCreateProjectChannel = Boolean(user) && Boolean(projectId)
  const canCreateDm = Boolean(user)
  const canManageChannel = Boolean(
    activeChannel &&
      !isDm &&
      (activeChannel.access === "public"
        ? activeChannel.projectId
          ? currentMemberRole === "owner"
          : user?.role === "admin"
        : currentChannelRole === "owner")
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
            onSelect={(channelId) => setActiveChannelId(channelId)}
            projectId={projectId}
            canCreateWorkspaceChannel={canCreateWorkspaceChannel}
            canCreateProjectChannel={canCreateProjectChannel}
            canCreateDm={canCreateDm}
            onChannelCreated={(channelId) => setActiveChannelId(channelId)}
            onDmCreated={(channelId) => setActiveChannelId(channelId)}
            onDeleteDm={(channelId) => deleteChannel.mutateAsync(channelId)}
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-border px-4 py-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">
                {activeChannel
                  ? isDm
                    ? `@ ${activeChannel.otherUser?.name ?? "Direct Message"}`
                    : `# ${activeChannel.name}`
                  : "Select a channel"}
              </div>
              {activeChannel?.project && !isPanel && !isDm && (
                <div className="text-xs text-muted-foreground">{activeChannel.project.name}</div>
              )}
              {isDm && activeChannel?.otherUser?.email && (
                <div className="text-xs text-muted-foreground">{activeChannel.otherUser.email}</div>
              )}
              {isPrivateChannel && !isDm && (
                <div className="text-xs text-muted-foreground">Private channel</div>
              )}
              {activeChannel?.description && !isDm && (
                <div className="text-xs text-muted-foreground mt-1">{activeChannel.description}</div>
              )}
            </div>
            {activeChannel && !isDm && isPrivateChannel && (
              <ChannelMembersDialog
                channel={activeChannel}
                canManage={canManageChannel}
                currentUserId={user?.id}
              />
            )}
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
            channelBots={channelBotsQuery.data ?? []}
            disabled={isArchived}
          />
        </div>
      </main>
    </div>
  )
}
