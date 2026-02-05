import { X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { UserCombobox } from "@/components/ui/user-combobox"
import type { User } from "@/api/types"

interface AttendeePickerProps {
  members: User[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function AttendeePicker({ members, selectedIds, onChange }: AttendeePickerProps) {
  const selectedMembers = members.filter((member) =>
    selectedIds.includes(member.id)
  )

  const removeAttendee = (userId: string) => {
    onChange(selectedIds.filter((id) => id !== userId))
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Attendees
      </div>
      <UserCombobox
        users={members}
        selectedIds={selectedIds}
        onChange={onChange}
        mode="multiple"
        placeholder="Select attendees..."
        searchPlaceholder="Search people..."
        emptyLabel="No members found"
      />
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedMembers.map((member) => (
            <Badge
              key={member.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[8px] bg-primary/10">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs">{member.name}</span>
              <button
                type="button"
                onClick={() => removeAttendee(member.id)}
                className="ml-1 hover:bg-muted rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
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
