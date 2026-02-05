import { useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { UserCombobox } from "@/components/ui/user-combobox"
import { useProjectMembers, useWorkspaceUsers } from "@/hooks/use-project-members"
import { ApiErrorResponse } from "@/api/client"
import { cn } from "@/lib/utils"
import type { ProjectMember } from "@/api/types"

interface ManageMembersDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  canManage: boolean
  currentUserId?: string
  projectName?: string
}

export function ManageMembersDialog({
  projectId,
  open,
  onOpenChange,
  canManage,
  currentUserId,
  projectName,
}: ManageMembersDialogProps) {
  const { members, isLoading, addMember, updateMemberRole, removeMember } = useProjectMembers(projectId)
  const usersQuery = useWorkspaceUsers()
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [newRole, setNewRole] = useState<"owner" | "member">("member")
  const [error, setError] = useState<string | null>(null)

  const isMutating = addMember.isPending || updateMemberRole.isPending || removeMember.isPending

  useEffect(() => {
    if (!open) {
      setSelectedUserIds([])
      setNewRole("member")
      setError(null)
    }
  }, [open])

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === "owner").length,
    [members]
  )

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

  const availableUsers = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.userId))
    return (usersQuery.data ?? []).filter(
      (user) => !memberIds.has(user.id) && !user.isDisabled
    )
  }, [members, usersQuery.data])

  const selectedUserId = selectedUserIds[0]

  const handleAddMember = async () => {
    if (!selectedUserId) return
    try {
      setError(null)
      await addMember.mutateAsync({ userId: selectedUserId, role: newRole })
      setSelectedUserIds([])
      setNewRole("member")
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to add member")
      }
    }
  }

  const handleRoleChange = async (userId: string, role: "owner" | "member") => {
    try {
      setError(null)
      await updateMemberRole.mutateAsync({ userId, role })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update member role")
      }
    }
  }

  const handleRemoveMember = async (userId: string) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Manage Members</DialogTitle>
          <DialogDescription>
            {projectName
              ? `Add and manage access for ${projectName}.`
              : "Add and manage access for this project."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {canManage && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="text-sm font-semibold">Add member</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <UserCombobox
                  users={availableUsers}
                  selectedIds={selectedUserIds}
                  onChange={setSelectedUserIds}
                  mode="single"
                  placeholder="Select a user"
                  searchPlaceholder="Search users..."
                  emptyLabel="No available users"
                  allowClear
                  disabled={isMutating || usersQuery.isLoading}
                  className="w-full sm:flex-1"
                  contentClassName="w-[360px]"
                />
                <Select value={newRole} onValueChange={(value) => setNewRole(value as "owner" | "member")}> 
                  <SelectTrigger className="w-full sm:w-[140px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={handleAddMember}
                  disabled={!selectedUserId || isMutating}
                  className="w-full sm:w-auto"
                >
                  {addMember.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Owners can manage members and update project settings.
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Members</span>
              <span className="text-muted-foreground">
                {members.length} total
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : sortedMembers.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No members found.
              </div>
            ) : (
              <div className="space-y-2">
                {sortedMembers.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    isOwner={member.role === "owner"}
                    isLastOwner={member.role === "owner" && ownerCount === 1}
                    isSelf={member.userId === currentUserId}
                    isTeamMember={member.source === "team"}
                    sourceTeamName={member.sourceTeam?.name ?? undefined}
                    canManage={canManage}
                    isMutating={isMutating}
                    onRoleChange={handleRoleChange}
                    onRemove={handleRemoveMember}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface MemberRowProps {
  member: ProjectMember
  isOwner: boolean
  isLastOwner: boolean
  isSelf: boolean
  isTeamMember: boolean
  sourceTeamName?: string
  canManage: boolean
  isMutating: boolean
  onRoleChange: (userId: string, role: "owner" | "member") => void
  onRemove: (userId: string) => void
}

function MemberRow({
  member,
  isOwner,
  isLastOwner,
  isSelf,
  isTeamMember,
  sourceTeamName,
  canManage,
  isMutating,
  onRoleChange,
  onRemove,
}: MemberRowProps) {
  const displayName = member.user?.name || "Unknown user"
  const displayEmail = member.user?.email || ""

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
            {isTeamMember && (
              <Badge variant="outline">
                {sourceTeamName ? `Team: ${sourceTeamName}` : "Team"}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{displayEmail}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {canManage ? (
          <Select
            value={member.role}
            onValueChange={(value) => onRoleChange(member.userId, value as "owner" | "member")}
            disabled={isMutating || isLastOwner || isTeamMember}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={isOwner ? "default" : "secondary"}>
            {isOwner ? "Owner" : "Member"}
          </Badge>
        )}

        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isMutating || isLastOwner || isTeamMember}
            onClick={() => onRemove(member.userId)}
            className={cn((isLastOwner || isTeamMember) && "opacity-60")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
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
