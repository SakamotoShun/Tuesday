import { Badge } from "@/components/ui/badge"
import type { User, UserRole } from "@/api/types"
import type { BadgeProps } from "@/components/ui/badge"

interface AccountInfoProps {
  user: User
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  member: "Member",
  freelancer: "Freelancer",
}

const ROLE_VARIANTS: Record<UserRole, BadgeProps["variant"]> = {
  admin: "default",
  member: "secondary",
  freelancer: "outline",
}

export function AccountInfo({ user }: AccountInfoProps) {
  const roleLabel = ROLE_LABELS[user.role]
  const roleVariant = ROLE_VARIANTS[user.role]

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
