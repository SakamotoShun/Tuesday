import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { chatApi } from "@/api/chat"
import type { ProjectMember, User } from "@/api/types"
import * as projectsApi from "@/api/projects"
import { useWorkspaceUsers } from "@/hooks/use-project-members"
import { useAuth } from "@/hooks/use-auth"
import { ApiErrorResponse } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { UserCombobox } from "@/components/ui/user-combobox"

interface NewChannelDialogProps {
  projectId?: string
  onCreated?: (channelId: string) => void
  trigger?: ReactNode
}

export function NewChannelDialog({ projectId, onCreated, trigger }: NewChannelDialogProps) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [access, setAccess] = useState<"public" | "private" | "invite_only">("public")
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const usersQuery = useWorkspaceUsers()
  const projectMembersQuery = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => (projectId ? projectsApi.getMembers(projectId) : Promise.resolve([])),
    enabled: Boolean(projectId),
  })

  const availableUsers = useMemo(() => {
    const source = projectId
      ? mapMembers(projectMembersQuery.data)
      : (usersQuery.data ?? [])
    return source.filter((user) => !user.isDisabled)
  }, [projectId, projectMembersQuery.data, usersQuery.data])

  const canCreatePublic = Boolean(projectId) || user?.role === "admin"

  useEffect(() => {
    if (!canCreatePublic && access === "public") {
      setAccess("private")
    }
  }, [access, canCreatePublic])

  useEffect(() => {
    if (!open) {
      setError(null)
    }
  }, [open])

  const createChannel = useMutation({
    mutationFn: () =>
      chatApi.createChannel({
        name,
        projectId: projectId ?? null,
        type: projectId ? "project" : "workspace",
        access,
        description: description.trim() ? description.trim() : null,
        memberIds: access === "public" ? undefined : memberIds,
      }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["channels"] })
      setName("")
      setDescription("")
      setAccess("public")
      setMemberIds([])
      setError(null)
      setOpen(false)
      onCreated?.(channel.id)
    },
    onError: (err) => {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to create channel")
      }
    },
  })

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createChannel.isPending || !name.trim()) return
    createChannel.mutate()
  }

  const showMemberPicker = access !== "public"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            New Channel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
          <DialogDescription>
            Set up a new channel to organize conversations.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Channel name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="channel-description">Description</Label>
            <Textarea
              id="channel-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a short topic or purpose"
              className="min-h-[88px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Access</Label>
            <Select value={access} onValueChange={(value) => setAccess(value as "public" | "private" | "invite_only")}>
              <SelectTrigger>
                <SelectValue placeholder="Select access" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public" disabled={!canCreatePublic}>Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="invite_only">Invite-only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Public channels are open to everyone. Private and invite-only channels require invitations.
            </p>
          </div>
          {showMemberPicker && (
            <div className="space-y-2">
              <Label>Invite members</Label>
              <UserCombobox
                users={availableUsers}
                selectedIds={memberIds}
                onChange={setMemberIds}
                mode="multiple"
                placeholder="Select members"
                searchPlaceholder="Search users..."
                emptyLabel="No available users"
                allowClear
                disabled={createChannel.isPending || usersQuery.isLoading || projectMembersQuery.isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Only invited members can view and participate in this channel.
              </p>
            </div>
          )}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createChannel.isPending || !name.trim()}>
              {createChannel.isPending ? "Creating..." : "Create Channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const mapMembers = (members?: ProjectMember[]): User[] =>
  members
    ?.map((member) => member.user)
    .filter((user): user is User => Boolean(user)) ?? []
