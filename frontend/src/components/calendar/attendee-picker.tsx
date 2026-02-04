import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { User } from "@/api/types"

interface AttendeePickerProps {
  members: User[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function AttendeePicker({ members, selectedIds, onChange }: AttendeePickerProps) {
  const toggle = (userId: string) => {
    onChange(
      selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId]
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Attendees
      </div>
      <div className="flex flex-wrap gap-2">
        {members.map((member) => {
          const isActive = selectedIds.includes(member.id)
          return (
            <Button
              key={member.id}
              type="button"
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => toggle(member.id)}
              className={cn("h-8", isActive && "shadow-sm")}
            >
              {member.name}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
