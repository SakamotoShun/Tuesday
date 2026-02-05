import { type ReactNode, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { chatApi } from "@/api/chat"
import { ApiErrorResponse } from "@/api/client"
import { useAuth } from "@/hooks/use-auth"
import { useWorkspaceUsers } from "@/hooks/use-project-members"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { UserCombobox } from "@/components/ui/user-combobox"

interface NewDmDialogProps {
  onCreated?: (channelId: string) => void
  trigger?: ReactNode
}

export function NewDmDialog({ onCreated, trigger }: NewDmDialogProps) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const usersQuery = useWorkspaceUsers()
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const availableUsers = useMemo(() => {
    return (usersQuery.data ?? []).filter(
      (workspaceUser) => workspaceUser.id !== user?.id && !workspaceUser.isDisabled
    )
  }, [usersQuery.data, user?.id])

  const createDm = useMutation({
    mutationFn: () =>
      selectedIds[0]
        ? chatApi.createDM({ userId: selectedIds[0] })
        : Promise.reject(new Error("No user selected")),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["channels"] })
      queryClient.invalidateQueries({ queryKey: ["dms"] })
      setSelectedIds([])
      setError(null)
      setOpen(false)
      onCreated?.(channel.id)
    },
    onError: (err) => {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to start DM")
      }
    },
  })

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedIds[0] || createDm.isPending) return
    createDm.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            New DM
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Start a direct message</DialogTitle>
          <DialogDescription>
            Choose a teammate to start a private conversation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Teammate</Label>
            <UserCombobox
              users={availableUsers}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              mode="single"
              placeholder="Select a user"
              searchPlaceholder="Search users..."
              emptyLabel="No available users"
              allowClear
              disabled={createDm.isPending || usersQuery.isLoading}
            />
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDm.isPending || !selectedIds[0]}>
              {createDm.isPending ? "Starting..." : "Start DM"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
