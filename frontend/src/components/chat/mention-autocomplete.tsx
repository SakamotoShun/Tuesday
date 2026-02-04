import type { User } from "@/api/types"

interface MentionAutocompleteProps {
  results: User[]
  visible: boolean
  onSelect: (user: User) => void
}

export function MentionAutocomplete({ results, visible, onSelect }: MentionAutocompleteProps) {
  if (!visible || results.length === 0) return null

  return (
    <div className="absolute bottom-14 left-0 right-0 z-10 rounded-md border border-border bg-card shadow-md">
      {results.map((user) => (
        <button
          key={user.id}
          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
          onClick={() => onSelect(user)}
        >
          {user.name}
        </button>
      ))}
    </div>
  )
}
