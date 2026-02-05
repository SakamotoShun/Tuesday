import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserCombobox } from "@/components/ui/user-combobox"
import { ApiErrorResponse } from "@/api/client"
import { useAdminUserOwnerships } from "@/hooks/use-admin"
import type { AdminDeleteUserInput, User } from "@/api/types"

interface DeleteUserDialogProps {
  user: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (input: AdminDeleteUserInput) => Promise<void>
  users: User[]
  currentUserId?: string
}

export function DeleteUserDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  users,
  currentUserId,
}: DeleteUserDialogProps) {
  const [confirmationValue, setConfirmationValue] = useState("")
  const [projectTransfers, setProjectTransfers] = useState<Record<string, string>>({})
  const [reassignToUserId, setReassignToUserId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const ownershipsQuery = useAdminUserOwnerships(user?.id, open)
  const ownerships = ownershipsQuery.data

  const ownedProjects = ownerships?.ownedProjects ?? []
  const createdContent = ownerships?.createdContent

  const createdContentTotal = useMemo(() => {
    if (!createdContent) return 0
    return (
      createdContent.docs +
      createdContent.tasks +
      createdContent.meetings +
      createdContent.whiteboards +
      createdContent.docCollabUpdates +
      createdContent.whiteboardCollabUpdates
    )
  }, [createdContent])

  const requiresProjectTransfers = ownedProjects.length > 0
  const requiresContentTransfer = createdContentTotal > 0
  const isSelf = Boolean(user?.id && user.id === currentUserId)
  const isLastAdmin = ownerships?.isLastAdmin ?? false

  const availableUsers = useMemo(() => {
    if (!user) return []
    return users.filter((candidate) => candidate.id !== user.id && !candidate.isDisabled)
  }, [users, user])

  const normalizedEmail = useMemo(() => user?.email.trim().toLowerCase() || "", [user?.email])
  const normalizedConfirmation = useMemo(() => confirmationValue.trim().toLowerCase(), [confirmationValue])
  const isConfirmationValid = normalizedConfirmation.length > 0 && normalizedConfirmation === normalizedEmail

  const isProjectTransfersComplete = !requiresProjectTransfers || ownedProjects.every((project) => projectTransfers[project.id])
  const isContentTransferComplete = !requiresContentTransfer || Boolean(reassignToUserId)

  const isDeleteDisabled =
    !isConfirmationValid ||
    !isProjectTransfersComplete ||
    !isContentTransferComplete ||
    isDeleting ||
    isSelf ||
    isLastAdmin ||
    ownershipsQuery.isLoading ||
    Boolean(ownershipsQuery.error) ||
    (requiresProjectTransfers && availableUsers.length === 0) ||
    (requiresContentTransfer && availableUsers.length === 0)

  useEffect(() => {
    if (!open) {
      setConfirmationValue("")
      setProjectTransfers({})
      setReassignToUserId("")
      setError(null)
      return
    }
    setConfirmationValue("")
    setError(null)
  }, [open, user?.id])

  const handleProjectTransferChange = (projectId: string, userId?: string) => {
    setProjectTransfers((prev) => ({
      ...prev,
      [projectId]: userId ?? "",
    }))
  }

  const handleReassignChange = (userId?: string) => {
    setReassignToUserId(userId ?? "")
  }

  const handleDelete = async () => {
    if (!user) return
    try {
      setIsDeleting(true)
      setError(null)

      const transferPayload = ownedProjects
        .map((project) => ({
          projectId: project.id,
          newOwnerId: projectTransfers[project.id],
        }))
        .filter((transfer): transfer is { projectId: string; newOwnerId: string } => Boolean(transfer.newOwnerId))

      const payload: AdminDeleteUserInput = {
        projectTransfers: transferPayload,
      }

      if (reassignToUserId) {
        payload.reassignToUserId = reassignToUserId
      }

      await onConfirm(payload)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to delete user")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete User
          </DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{user.name}</strong> and remove their access. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {(error || ownershipsQuery.error) && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error ?? "Failed to load ownership details"}
            </div>
          )}

          {isSelf && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              You cannot delete your own account.
            </div>
          )}

          {isLastAdmin && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              This user is the last active admin and cannot be deleted.
            </div>
          )}

          {ownershipsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading ownership details...</div>
          ) : (
            <>
              {requiresProjectTransfers && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                  <div className="text-sm font-semibold text-destructive">Transfer project ownership</div>
                  <p className="text-xs text-muted-foreground">
                    Assign a new owner for each project before deletion.
                  </p>

                  {availableUsers.length === 0 ? (
                    <div className="text-sm text-destructive">No eligible users available for transfer.</div>
                  ) : (
                    <div className="space-y-3">
                      {ownedProjects.map((project) => {
                        const transferValue = projectTransfers[project.id] ?? ""
                        return (
                        <div key={project.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-medium">{project.name}</div>
                          <div className="w-full sm:w-[280px]">
                            <UserCombobox
                              users={availableUsers}
                              selectedIds={transferValue ? [transferValue] : []}
                              onChange={(ids) => handleProjectTransferChange(project.id, ids[0])}
                              mode="single"
                              placeholder="Select new owner"
                              allowClear
                            />
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {requiresContentTransfer && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                  <div className="text-sm font-semibold text-destructive">Transfer created content</div>
                  <div className="text-xs text-muted-foreground">All created content and collaboration history will move to the selected user.</div>

                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Docs</span>
                      <span>{createdContent?.docs ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Tasks</span>
                      <span>{createdContent?.tasks ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Meetings</span>
                      <span>{createdContent?.meetings ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Whiteboards</span>
                      <span>{createdContent?.whiteboards ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Doc edits</span>
                      <span>{createdContent?.docCollabUpdates ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Whiteboard edits</span>
                      <span>{createdContent?.whiteboardCollabUpdates ?? 0}</span>
                    </div>
                  </div>

                  {availableUsers.length === 0 ? (
                    <div className="text-sm text-destructive">No eligible users available for transfer.</div>
                  ) : (
                    <UserCombobox
                      users={availableUsers}
                      selectedIds={reassignToUserId ? [reassignToUserId] : []}
                      onChange={(ids) => handleReassignChange(ids[0])}
                      mode="single"
                      placeholder="Select transfer user"
                      allowClear
                    />
                  )}
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Type the user email to confirm</label>
            <Input
              value={confirmationValue}
              onChange={(event) => setConfirmationValue(event.target.value)}
              placeholder={user.email}
              disabled={isDeleting}
            />
            {confirmationValue.length > 0 && !isConfirmationValid && (
              <p className="text-xs text-muted-foreground">Enter the exact email to enable deletion.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleteDisabled}>
            {isDeleting ? "Deleting..." : "Delete user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
