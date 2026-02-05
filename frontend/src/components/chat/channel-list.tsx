import { Lock, Plus } from "lucide-react"
import type { Channel } from "@/api/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NewChannelDialog } from "@/components/chat/new-channel-dialog"
import { NewDmDialog } from "@/components/chat/new-dm-dialog"
import { cn } from "@/lib/utils"

interface ChannelListProps {
  channels: Channel[]
  activeChannelId: string | null
  onSelect: (channelId: string) => void
  projectId?: string
  canCreateWorkspaceChannel?: boolean
  canCreateProjectChannel?: boolean
  canCreateDm?: boolean
  onChannelCreated?: (channelId: string) => void
  onDmCreated?: (channelId: string) => void
}

export function ChannelList({
  channels,
  activeChannelId,
  onSelect,
  projectId,
  canCreateWorkspaceChannel = false,
  canCreateProjectChannel = false,
  canCreateDm = false,
  onChannelCreated,
  onDmCreated,
}: ChannelListProps) {

  const workspaceChannels = channels.filter((channel) => channel.type === "workspace")
  const projectChannels = channels.filter((channel) => channel.type === "project")
  const dmChannels = channels.filter((channel) => channel.type === "dm")

  const showWorkspaceSection = workspaceChannels.length > 0 || canCreateWorkspaceChannel
  const showProjectSection = projectChannels.length > 0 || canCreateProjectChannel
  const showDmSection = dmChannels.length > 0 || canCreateDm

  if (!showWorkspaceSection && !showProjectSection && !showDmSection) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No channels yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showWorkspaceSection && (
        <div>
          <div className="px-4 mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Workspace
            </div>
            {canCreateWorkspaceChannel && (
              <NewChannelDialog
                onCreated={onChannelCreated}
                trigger={(
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    aria-label="Add workspace channel"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              />
            )}
          </div>
          {workspaceChannels.length > 0 ? (
            <div className="space-y-1">
              {workspaceChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => onSelect(channel.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2 rounded-md text-sm transition-colors",
                    activeChannelId === channel.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <span className="truncate flex items-center gap-2">
                    <span className="truncate"># {channel.name}</span>
                    {channel.access !== "public" && (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                  {(channel.unreadCount ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {channel.unreadCount}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 text-xs text-muted-foreground">No workspace channels yet.</div>
          )}
        </div>
      )}

      {showProjectSection && (
        <div>
          <div className="px-4 mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Projects
            </div>
            {canCreateProjectChannel && (
              <NewChannelDialog
                projectId={projectId}
                onCreated={onChannelCreated}
                trigger={(
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    aria-label="Add project channel"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              />
            )}
          </div>
          {projectChannels.length > 0 ? (
            <div className="space-y-1">
              {projectChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => onSelect(channel.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2 rounded-md text-sm transition-colors",
                    activeChannelId === channel.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <span className="truncate flex items-center gap-2">
                    <span className="truncate"># {channel.name}</span>
                    {channel.access !== "public" && (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                  {(channel.unreadCount ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {channel.unreadCount}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 text-xs text-muted-foreground">No project channels yet.</div>
          )}
        </div>
      )}

      {showDmSection && (
        <div>
          <div className="px-4 mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Direct Messages
            </div>
            {canCreateDm && (
              <NewDmDialog
                onCreated={onDmCreated}
                trigger={(
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    aria-label="Start a direct message"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              />
            )}
          </div>
          {dmChannels.length > 0 ? (
            <div className="space-y-1">
              {dmChannels.map((channel) => {
                const displayName = channel.otherUser?.name ?? "Direct Message"
                return (
                  <button
                    key={channel.id}
                    onClick={() => onSelect(channel.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2 rounded-md text-sm transition-colors",
                      activeChannelId === channel.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="truncate flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-muted">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">@ {displayName}</span>
                    </span>
                    {(channel.unreadCount ?? 0) > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {channel.unreadCount}
                      </Badge>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-4 text-xs text-muted-foreground">No direct messages yet.</div>
          )}
        </div>
      )}
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
