import type { User } from "@/api/types"

interface TypingIndicatorProps {
  users: Array<Pick<User, "id" | "name" | "avatarUrl">>
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null

  const names = users.map((user) => user.name).join(", ")
  return (
    <div className="text-xs text-muted-foreground">
      {names} {users.length === 1 ? "is" : "are"} typing...
    </div>
  )
}
