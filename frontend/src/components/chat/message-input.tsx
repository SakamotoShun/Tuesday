import { useEffect, useMemo, useRef, useState } from "react"
import type { User } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MentionAutocomplete } from "@/components/chat/mention-autocomplete"

interface MessageInputProps {
  onSend: (content: string) => void
  onTyping: (isTyping: boolean) => void
  members?: User[]
}

const handleFromName = (name: string) => name.toLowerCase().replace(/\s+/g, "")

export function MessageInput({ onSend, onTyping, members = [] }: MessageInputProps) {
  const [value, setValue] = useState("")
  const [query, setQuery] = useState("")
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const typingTimeout = useRef<number | null>(null)

  useEffect(() => {
    onTyping(value.length > 0)
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    typingTimeout.current = window.setTimeout(() => onTyping(false), 1200)
    return () => {
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    }
  }, [value, onTyping])

  const results = useMemo(() => {
    if (!showAutocomplete || query.length === 0) return []
    const lower = query.toLowerCase()
    return members.filter((member) => handleFromName(member.name).startsWith(lower)).slice(0, 6)
  }, [members, query, showAutocomplete])

  const updateMentionQuery = (text: string, cursor: number) => {
    const slice = text.slice(0, cursor)
    const match = slice.match(/@([a-zA-Z0-9._-]*)$/)
    if (match) {
      setQuery(match[1] ?? "")
      setShowAutocomplete(true)
    } else {
      setQuery("")
      setShowAutocomplete(false)
    }
  }

  const handleChange = (next: string) => {
    setValue(next)
    const cursor = textareaRef.current?.selectionStart ?? next.length
    updateMentionQuery(next, cursor)
  }

  const handleSelect = (user: User) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const cursor = textarea.selectionStart
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const match = before.match(/@([a-zA-Z0-9._-]*)$/)
    if (!match) return
    const handle = handleFromName(user.name)
    const nextValue = `${before.slice(0, match.index)}@${handle} ${after}`
    setValue(nextValue)
    setShowAutocomplete(false)
    setQuery("")
    requestAnimationFrame(() => {
      const position = (match.index ?? 0) + handle.length + 2
      textarea.selectionStart = position
      textarea.selectionEnd = position
      textarea.focus()
    })
  }

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue("")
    setShowAutocomplete(false)
    setQuery("")
  }

  return (
    <div className="relative">
      <MentionAutocomplete results={results} visible={showAutocomplete} onSelect={handleSelect} />
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Write a message..."
          className="min-h-[64px] max-h-40"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
        />
        <Button onClick={handleSend} disabled={!value.trim()}>
          Send
        </Button>
      </div>
    </div>
  )
}
