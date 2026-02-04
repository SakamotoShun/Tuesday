import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InviteUserDialog } from "@/components/admin/invite-user-dialog"
import { useAdminUsers } from "@/hooks/use-admin"

export function UserManagement() {
  const { users, isLoading, updateUser } = useAdminUsers()

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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Disabled</span>
                  <Switch
                    checked={user.isDisabled}
                    onCheckedChange={(checked) =>
                      updateUser.mutate({ userId: user.id, data: { isDisabled: checked } })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
