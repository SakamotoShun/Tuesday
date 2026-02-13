import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { InviteUserDialog } from "@/components/admin/invite-user-dialog"
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog"
import { useAdminUsers } from "@/hooks/use-admin"
import { useAuth } from "@/hooks/use-auth"
import type { AdminDeleteUserInput, User } from "@/api/types"

export function UserManagement() {
  const { users, isLoading, updateUser, deleteUser } = useAdminUsers()
  const { user: currentUser } = useAuth()
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Users</div>
          <div className="text-sm text-muted-foreground">Manage roles and access.</div>
        </div>
        <InviteUserDialog />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading users...</div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border rounded-lg p-3 bg-background"
            >
              <div>
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={user.role}
                  onValueChange={(value) =>
                    updateUser.mutate({ userId: user.id, data: { role: value as "admin" | "member" } })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={user.employmentType}
                  onValueChange={(value) =>
                    updateUser.mutate({ userId: user.id, data: { employmentType: value as "hourly" | "full_time" } })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-28"
                  defaultValue={user.hourlyRate ?? ""}
                  placeholder="Rate"
                  onBlur={(event) => {
                    const value = event.target.value.trim()
                    updateUser.mutate({
                      userId: user.id,
                      data: { hourlyRate: value === "" ? null : Number(value) },
                    })
                  }}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Disabled</span>
                  <Switch
                    checked={user.isDisabled}
                    onCheckedChange={(checked) =>
                      updateUser.mutate({ userId: user.id, data: { isDisabled: checked } })
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(user)}
                  disabled={user.id === currentUser?.id}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteUserDialog
        user={deleteTarget}
        users={users}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        currentUserId={currentUser?.id}
        onConfirm={async (input: AdminDeleteUserInput) => {
          if (!deleteTarget) return
          await deleteUser.mutateAsync({ userId: deleteTarget.id, data: input })
        }}
      />
    </div>
  )
}
