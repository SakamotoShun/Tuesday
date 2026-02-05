import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import { Paperclip } from "lucide-react"
import type { FileAttachment, User } from "@/api/types"
import { uploadFile } from "@/api/files"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AttachmentList } from "@/components/chat/attachment-list"
import { MentionAutocomplete, type MentionOption } from "@/components/chat/mention-autocomplete"

interface MessageInputProps {
  onSend: (payload: { content: string; attachments: FileAttachment[] }) => Promise<unknown> | void
  onTyping: (isTyping: boolean) => void
  members?: User[]
  disabled?: boolean
}

const handleFromName = (name: string) => name.toLowerCase().replace(/\s+/g, "")

const specialMentions = [
  { key: "here", label: "@here", description: "Notify people active in this channel" },
  { key: "channel", label: "@channel", description: "Notify everyone in this channel" },
  { key: "everyone", label: "@everyone", description: "Notify everyone in the workspace" },
]

const createTempId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`

export function MessageInput({ onSend, onTyping, members = [], disabled = false }: MessageInputProps) {
  const [value, setValue] = useState("")
  const [query, setQuery] = useState("")
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadingIds, setUploadingIds] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const typingTimeout = useRef<number | null>(null)

  useEffect(() => {
    if (disabled) {
      onTyping(false)
      return
    }
    onTyping(value.length > 0)
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    typingTimeout.current = window.setTimeout(() => onTyping(false), 1200)
    return () => {
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    }
  }, [value, onTyping, disabled])

  const mentionOptions = useMemo<MentionOption[]>(() => {
    if (!showAutocomplete) return []
    const lower = query.toLowerCase()
    const specials = specialMentions
      .filter((special) => lower.length === 0 || special.key.startsWith(lower))
      .map<MentionOption>((special) => ({
        type: "special",
        key: special.key,
        label: special.label,
        description: special.description,
      }))

    const userMatches = members
      .filter((member) => handleFromName(member.name).startsWith(lower))
      .slice(0, Math.max(0, 8 - specials.length))
      .map<MentionOption>((member) => ({ type: "user", user: member }))

    return [...specials, ...userMatches]
  }, [members, query, showAutocomplete])

  useEffect(() => {
    if (showAutocomplete) {
      setActiveIndex(0)
    }
  }, [showAutocomplete, mentionOptions.length])

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

  const insertMention = (replacement: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const cursor = textarea.selectionStart
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const match = before.match(/@([a-zA-Z0-9._-]*)$/)
    if (!match) return
    const nextValue = `${before.slice(0, match.index)}@${replacement} ${after}`
    setValue(nextValue)
    setShowAutocomplete(false)
    setQuery("")
    requestAnimationFrame(() => {
      const position = (match.index ?? 0) + replacement.length + 2
      textarea.selectionStart = position
      textarea.selectionEnd = position
      textarea.focus()
    })
  }

  const handleSelectOption = (option: MentionOption) => {
    if (option.type === "user") {
      insertMention(handleFromName(option.user.name))
      return
    }
    insertMention(option.key)
  }

  const handleSend = async () => {
    if (disabled) return
    if (uploadingIds.length > 0) return
    const trimmed = value.trim()
    if (!trimmed && attachments.length === 0) return
    try {
      await Promise.resolve(onSend({ content: trimmed, attachments }))
      setValue("")
      setAttachments([])
      setUploadErrors([])
      setShowAutocomplete(false)
      setQuery("")
    } catch (error) {
      if (error instanceof Error) {
        setUploadErrors((current) => [...current, error.message])
      } else {
        setUploadErrors((current) => [...current, "Failed to send message"])
      }
    }
  }

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    setUploadErrors([])

    for (const file of files) {
      const uploadId = createTempId()
      setUploadingIds((current) => [...current, uploadId])
      try {
        const uploaded = await uploadFile(file)
        setAttachments((current) => [...current, uploaded])
      } catch (error) {
        if (error instanceof Error) {
          setUploadErrors((current) => [...current, error.message])
        } else {
          setUploadErrors((current) => [...current, "Failed to upload file"]) 
        }
      } finally {
        setUploadingIds((current) => current.filter((id) => id !== uploadId))
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const canSend = !disabled && uploadingIds.length === 0 && (value.trim().length > 0 || attachments.length > 0)

  return (
    <div className="relative space-y-2">
      <MentionAutocomplete
        options={mentionOptions}
        visible={showAutocomplete}
        activeIndex={activeIndex}
        onSelect={handleSelectOption}
        onHover={setActiveIndex}
      />

      {attachments.length > 0 && (
        <AttachmentList
          attachments={attachments}
          onRemove={(fileId) => setAttachments((current) => current.filter((attachment) => attachment.id !== fileId))}
          compact
        />
      )}

      {uploadingIds.length > 0 && (
        <div className="text-xs text-muted-foreground">Uploading attachments...</div>
      )}

      {uploadErrors.length > 0 && (
        <div className="text-xs text-destructive">{uploadErrors[uploadErrors.length - 1]}</div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={disabled ? "Channel is archived" : "Write a message..."}
          className="min-h-[64px] max-h-40"
          disabled={disabled}
          onKeyDown={(event) => {
            if (disabled) return
            if (showAutocomplete && mentionOptions.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActiveIndex((current) => (current + 1) % mentionOptions.length)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setActiveIndex((current) => (current - 1 + mentionOptions.length) % mentionOptions.length)
                return
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault()
                const option = mentionOptions[activeIndex]
                if (option) {
                  handleSelectOption(option)
                }
                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setShowAutocomplete(false)
                return
              }
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            Send
          </Button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />
    </div>
  )
}
