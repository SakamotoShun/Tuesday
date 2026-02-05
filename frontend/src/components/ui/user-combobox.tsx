import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { User } from "@/api/types"

interface UserComboboxProps {
  users: User[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  mode?: "single" | "multiple"
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  disabled?: boolean
  excludeIds?: string[]
  allowClear?: boolean
  className?: string
  contentClassName?: string
}

export function UserCombobox({
  users,
  selectedIds,
  onChange,
  mode = "single",
  placeholder = "Select a user...",
  searchPlaceholder = "Search users...",
  emptyLabel = "No users found",
  disabled = false,
  excludeIds = [],
  allowClear = false,
  className,
  contentClassName,
}: UserComboboxProps) {
  const [open, setOpen] = useState(false)
  const isSingle = mode === "single"

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])
  const availableUsers = useMemo(
    () => users.filter((user) => !excludeSet.has(user.id)),
    [users, excludeSet]
  )

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedIds.includes(user.id)),
    [users, selectedIds]
  )

  const triggerLabel = isSingle
    ? selectedUsers[0]?.name ?? placeholder
    : selectedUsers.length > 0
      ? `${selectedUsers.length} selected`
      : placeholder

  const handleSelect = (userId: string) => {
    if (disabled) return
    const isSelected = selectedIds.includes(userId)

    if (isSingle) {
      onChange(isSelected ? [] : [userId])
      setOpen(false)
      return
    }

    if (isSelected) {
      onChange(selectedIds.filter((id) => id !== userId))
    } else {
      onChange([...selectedIds, userId])
    }
  }

  const clearSelection = () => {
    if (disabled) return
    onChange([])
    if (isSingle) {
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[320px] p-0", contentClassName)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {allowClear && selectedIds.length > 0 && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="clear"
                    onSelect={clearSelection}
                    className="text-muted-foreground"
                  >
                    Clear selection
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup>
              {availableUsers.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.name} ${user.email}`}
                  onSelect={() => handleSelect(user.id)}
                  className="aria-selected:bg-muted aria-selected:text-foreground hover:bg-muted"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px] bg-primary/10">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm">{user.name}</span>
                      <span className="text-xs text-foreground/70">
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4",
                      selectedIds.includes(user.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
