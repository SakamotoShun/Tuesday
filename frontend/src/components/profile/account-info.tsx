import { Badge } from "@/components/ui/badge"
import type { User } from "@/api/types"

interface AccountInfoProps {
  user: User
}

export function AccountInfo({ user }: AccountInfoProps) {
  const roleLabel = user.role === "admin" ? "Admin" : "Member"
  const roleVariant = user.role === "admin" ? "default" : "secondary"

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value))

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Email</div>
        <div className="text-sm font-medium">{user.email}</div>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Role</div>
        <Badge variant={roleVariant}>{roleLabel}</Badge>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Member since</div>
        <div className="text-sm font-medium">{formatDate(user.createdAt)}</div>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Last updated</div>
        <div className="text-sm font-medium">{formatDate(user.updatedAt)}</div>
      </div>
    </div>
  )
}
