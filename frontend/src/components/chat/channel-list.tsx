import { type ReactNode, useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Lock, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import type { Channel } from "@/api/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NewChannelDialog } from "@/components/chat/new-channel-dialog"
import { NewDmDialog } from "@/components/chat/new-dm-dialog"
import { DeleteDmDialog } from "@/components/chat/delete-dm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  onDeleteDm?: (channelId: string) => Promise<unknown> | void
  onReorderChannels?: (channelIds: string[]) => void
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
  onDeleteDm,
  onReorderChannels,
}: ChannelListProps) {

  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const workspaceChannels = channels.filter((channel) => channel.type === "workspace")
  const projectChannels = channels.filter((channel) => channel.type === "project")
  const dmChannels = channels.filter((channel) => channel.type === "dm")

  const canDeleteDm = Boolean(onDeleteDm)
  const deleteDisplayName = deleteTarget?.otherUser?.name?.trim() || "this user"

  const handleDeleteOpenChange = (open: boolean) => {
    setDeleteOpen(open)
    if (!open) {
      setDeleteTarget(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onDeleteDm) return
    await onDeleteDm(deleteTarget.id)
  }

  const handleSectionReorder = (event: DragEndEvent, sectionChannels: Channel[]) => {
    if (!onReorderChannels) return

    const { active, over } = event
    if (!over || active.id === over.id) return

    const fromIndex = sectionChannels.findIndex((channel) => channel.id === active.id)
    const toIndex = sectionChannels.findIndex((channel) => channel.id === over.id)

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const reorderedChannels = arrayMove(sectionChannels, fromIndex, toIndex)
    onReorderChannels(reorderedChannels.map((channel) => channel.id))
  }

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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleSectionReorder(event, workspaceChannels)}
            >
              <SortableContext
                items={workspaceChannels.map((channel) => channel.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {workspaceChannels.map((channel) => (
                    <SortableChannelItem key={channel.id} id={channel.id}>
                      <button
                        onClick={() => onSelect(channel.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
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
                    </SortableChannelItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleSectionReorder(event, projectChannels)}
            >
              <SortableContext
                items={projectChannels.map((channel) => channel.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {projectChannels.map((channel) => (
                    <SortableChannelItem key={channel.id} id={channel.id}>
                      <button
                        onClick={() => onSelect(channel.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
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
                    </SortableChannelItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleSectionReorder(event, dmChannels)}
            >
              <SortableContext
                items={dmChannels.map((channel) => channel.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {dmChannels.map((channel) => {
                    const displayName = channel.otherUser?.name ?? "Direct Message"
                    const unreadCount = channel.unreadCount ?? 0
                    return (
                      <SortableChannelItem key={channel.id} id={channel.id}>
                        <div
                          className={cn(
                            "group w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                            activeChannelId === channel.id
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(channel.id)}
                            className="flex flex-1 items-center justify-between text-left"
                          >
                            <span className="truncate flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-[10px] bg-muted">
                                  {getInitials(displayName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">@ {displayName}</span>
                            </span>
                            {unreadCount > 0 && (
                              <Badge variant="secondary" className="ml-2">
                                {unreadCount}
                              </Badge>
                            )}
                          </button>
                          {canDeleteDm && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                  aria-label={`DM actions for ${displayName}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-48">
                                <DropdownMenuItem
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setDeleteTarget(channel)
                                    setDeleteOpen(true)
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete conversation
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </SortableChannelItem>
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="px-4 text-xs text-muted-foreground">No direct messages yet.</div>
          )}
        </div>
      )}
      <DeleteDmDialog
        open={deleteOpen}
        onOpenChange={handleDeleteOpenChange}
        displayName={deleteDisplayName}
        onConfirm={handleDeleteConfirm}
      />
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

interface SortableChannelItemProps {
  id: string
  children: ReactNode
}

function SortableChannelItem({ id, children }: SortableChannelItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 px-2">
      <button
        type="button"
        className="h-7 w-5 shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder channel"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
