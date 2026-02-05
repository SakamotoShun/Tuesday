import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { UserCombobox } from "@/components/ui/user-combobox"
import type { User } from "@/api/types"

interface AssigneePickerProps {
  members: User[]
  selectedIds: string[]
  onChange: (assigneeIds: string[]) => void
  disabled?: boolean
}

export function AssigneePicker({
  members,
  selectedIds,
  onChange,
  disabled = false,
}: AssigneePickerProps) {
  const selectedMembers = members.filter((member) =>
    selectedIds.includes(member.id)
  )

  const removeAssignee = (memberId: string) => {
    onChange(selectedIds.filter((id) => id !== memberId))
  }

  const clearAll = () => {
    onChange([])
  }

  return (
    <div className="space-y-2">
      <UserCombobox
        users={members}
        selectedIds={selectedIds}
        onChange={onChange}
        mode="multiple"
        placeholder="Select assignees..."
        searchPlaceholder="Search members..."
        emptyLabel="No members found"
        disabled={disabled}
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
                onClick={() => removeAssignee(member.id)}
                className="ml-1 hover:bg-muted rounded"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={clearAll}
            disabled={disabled}
          >
            Clear all
          </Button>
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
