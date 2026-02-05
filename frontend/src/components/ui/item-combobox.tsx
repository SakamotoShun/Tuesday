import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface ItemComboboxProps<T> {
  items: T[]
  value: string | null
  onChange: (value: string | null) => void
  getItemId: (item: T) => string
  getItemLabel: (item: T) => string
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  includeAllOption?: boolean
  allLabel?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
}

export function ItemCombobox<T>({
  items,
  value,
  onChange,
  getItemId,
  getItemLabel,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyLabel = "No results found",
  includeAllOption = false,
  allLabel = "All",
  disabled = false,
  className,
  contentClassName,
}: ItemComboboxProps<T>) {
  const [open, setOpen] = useState(false)

  const selectedItem = useMemo(
    () => items.find((item) => getItemId(item) === value),
    [items, value, getItemId]
  )

  const handleSelect = (itemId: string | null) => {
    if (disabled) return
    onChange(itemId)
    setOpen(false)
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
          <span className="truncate">
            {selectedItem ? getItemLabel(selectedItem) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[280px] p-0", contentClassName)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {includeAllOption && (
                <CommandItem
                  value={allLabel}
                  onSelect={() => handleSelect(null)}
                  className="aria-selected:bg-muted aria-selected:text-foreground hover:bg-muted"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === null ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {allLabel}
                </CommandItem>
              )}
              {items.map((item) => {
                const itemId = getItemId(item)
                const itemLabel = getItemLabel(item)
                return (
                  <CommandItem
                    key={itemId}
                    value={itemLabel}
                    onSelect={() => handleSelect(itemId)}
                    className="aria-selected:bg-muted aria-selected:text-foreground hover:bg-muted"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === itemId ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {itemLabel}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
