import { useEffect, useMemo, useState } from "react"
import { Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { UserCombobox } from "@/components/ui/user-combobox"
import { ApiErrorResponse } from "@/api/client"
import type { Channel, ChannelMember, ProjectMember, User } from "@/api/types"
import * as projectsApi from "@/api/projects"
import { useChannelMembers } from "@/hooks/use-channel-members"
import { useWorkspaceUsers } from "@/hooks/use-project-members"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"

interface ChannelMembersDialogProps {
  channel: Channel
  canManage: boolean
  currentUserId?: string
}

const mapMembers = (members?: ProjectMember[]): User[] =>
  members
    ?.map((member) => member.user)
    .filter((user): user is User => Boolean(user)) ?? []

export function ChannelMembersDialog({ channel, canManage, currentUserId }: ChannelMembersDialogProps) {
  const { members, isLoading, addMembers, removeMember } = useChannelMembers(channel.id)
  const usersQuery = useWorkspaceUsers()
  const projectMembersQuery = useQuery({
    queryKey: ["projects", channel.projectId, "members"],
    queryFn: () => (channel.projectId ? projectsApi.getMembers(channel.projectId) : Promise.resolve([])),
    enabled: Boolean(channel.projectId),
  })

  const [open, setOpen] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSelectedUserIds([])
      setError(null)
    }
  }, [open])

  const availableUsers = useMemo(() => {
    const source = channel.projectId
      ? mapMembers(projectMembersQuery.data)
      : (usersQuery.data ?? [])
    const memberIds = new Set(members.map((member) => member.userId))
    return source.filter((user) => !user.isDisabled && !memberIds.has(user.id))
  }, [channel.projectId, members, projectMembersQuery.data, usersQuery.data])

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === "owner" ? -1 : 1
      }
      const nameA = (a.user?.name ?? a.user?.email ?? "").toLowerCase()
      const nameB = (b.user?.name ?? b.user?.email ?? "").toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [members])

  const handleAddMembers = async () => {
    if (selectedUserIds.length === 0) return
    try {
      setError(null)
      await addMembers.mutateAsync(selectedUserIds)
      setSelectedUserIds([])
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to add members")
      }
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      setError(null)
      await removeMember.mutateAsync(userId)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to remove member")
      }
    }
  }

  const isPrivate = channel.access !== "public"
  const canInvite = canManage && isPrivate
  const isMutating = addMembers.isPending || removeMember.isPending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Channel members">
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Channel members</DialogTitle>
          <DialogDescription>
            {isPrivate
              ? "Invite teammates and manage access to this channel."
              : "View the members of this channel."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {canInvite && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="text-sm font-semibold">Invite members</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <UserCombobox
                  users={availableUsers}
                  selectedIds={selectedUserIds}
                  onChange={setSelectedUserIds}
                  mode="multiple"
                  placeholder="Select members"
                  searchPlaceholder="Search users..."
                  emptyLabel="No available users"
                  allowClear
                  disabled={isMutating || usersQuery.isLoading || projectMembersQuery.isLoading}
                  className="w-full sm:flex-1"
                  contentClassName="w-[360px]"
                />
                <Button
                  type="button"
                  onClick={handleAddMembers}
                  disabled={selectedUserIds.length === 0 || isMutating}
                  className="w-full sm:w-auto"
                >
                  {addMembers.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Only invited members can access this channel.
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Members</span>
              <span className="text-muted-foreground">{members.length} total</span>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading members...</div>
            ) : sortedMembers.length === 0 ? (
              <div className="text-sm text-muted-foreground">No members found.</div>
            ) : (
              <div className="space-y-2">
                {sortedMembers.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    isSelf={member.userId === currentUserId}
                    canManage={canManage}
                    isMutating={isMutating}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface MemberRowProps {
  member: ChannelMember
  isSelf: boolean
  canManage: boolean
  isMutating: boolean
  onRemove: (userId: string) => void
}

function MemberRow({ member, isSelf, canManage, isMutating, onRemove }: MemberRowProps) {
  const displayName = member.user?.name || "Unknown user"
  const displayEmail = member.user?.email || ""
  const showRemove = canManage || isSelf

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-xs bg-primary/10">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{displayName}</span>
            {isSelf && <Badge variant="secondary">You</Badge>}
            <Badge variant={member.role === "owner" ? "default" : "secondary"}>
              {member.role === "owner" ? "Owner" : "Member"}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">{displayEmail}</div>
        </div>
      </div>

      {showRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isMutating}
          onClick={() => onRemove(member.userId)}
          className={cn("opacity-80 hover:opacity-100")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
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
