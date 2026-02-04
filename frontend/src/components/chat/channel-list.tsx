import type { Channel } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ChannelListProps {
  channels: Channel[]
  activeChannelId: string | null
  onSelect: (channelId: string) => void
}

export function ChannelList({ channels, activeChannelId, onSelect }: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No channels yet.
      </div>
    )
  }

  const workspaceChannels = channels.filter((channel) => channel.type === "workspace")
  const projectChannels = channels.filter((channel) => channel.type === "project")

  return (
    <div className="space-y-4">
      {workspaceChannels.length > 0 && (
        <div>
          <div className="px-4 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Workspace
          </div>
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
                <span className="truncate"># {channel.name}</span>
                {(channel.unreadCount ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {channel.unreadCount}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {projectChannels.length > 0 && (
        <div>
          <div className="px-4 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Projects
          </div>
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
                <span className="truncate"># {channel.name}</span>
                {(channel.unreadCount ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {channel.unreadCount}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
