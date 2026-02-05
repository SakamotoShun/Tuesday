import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowUp, Paperclip } from "lucide-react"
import type { FileAttachment, User } from "@/api/types"
import { uploadFile } from "@/api/files"
import { Button } from "@/components/ui/button"
import { AttachmentList, type PendingAttachment } from "@/components/chat/attachment-list"
import { MentionAutocomplete, type MentionOption } from "@/components/chat/mention-autocomplete"
import { cn } from "@/lib/utils"

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

interface PendingUpload {
  tempId: string
  file: File
  previewUrl: string | null
}

export function MessageInput({ onSend, onTyping, members = [], disabled = false }: MessageInputProps) {
  const [value, setValue] = useState("")
  const [query, setQuery] = useState("")
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [uploadErrors, setUploadErrors] = useState<{ id: string; message: string }[]>([])
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const typingTimeout = useRef<number | null>(null)
  const canceledUploads = useRef<Set<string>>(new Set())
  const pendingUploadsRef = useRef<PendingUpload[]>([])

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

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads
  }, [pendingUploads])

  useEffect(() => {
    return () => {
      pendingUploadsRef.current.forEach((upload) => {
        if (upload.previewUrl) {
          URL.revokeObjectURL(upload.previewUrl)
        }
      })
    }
  }, [])

  const pushUploadError = useCallback((message: string) => {
    const id = createTempId()
    setUploadErrors((current) => [...current, { id, message }])
    window.setTimeout(() => {
      setUploadErrors((current) => current.filter((error) => error.id !== id))
    }, 4000)
  }, [])

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
    if (pendingUploads.length > 0) return
    const trimmed = value.trim()
    if (!trimmed && attachments.length === 0) return
    try {
      await Promise.resolve(onSend({ content: trimmed, attachments }))
      setValue("")
      setAttachments([])
      setPendingUploads([])
      canceledUploads.current.clear()
      setUploadErrors([])
      setShowAutocomplete(false)
      setQuery("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message"
      pushUploadError(message)
    }
  }

  const processPendingUploads = async (uploads: PendingUpload[]) => {
    await Promise.all(
      uploads.map(async (upload) => {
        try {
          const uploaded = await uploadFile(upload.file)
          if (!canceledUploads.current.has(upload.tempId)) {
            setAttachments((current) => [...current, uploaded])
          }
        } catch (error) {
          if (!canceledUploads.current.has(upload.tempId)) {
            const message = error instanceof Error ? error.message : "Failed to upload file"
            pushUploadError(message)
          }
        } finally {
          setPendingUploads((current) =>
            current.filter((item) => item.tempId !== upload.tempId)
          )
          if (upload.previewUrl) {
            URL.revokeObjectURL(upload.previewUrl)
          }
          canceledUploads.current.delete(upload.tempId)
        }
      })
    )
  }

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    if (files.length === 0) return

    const newPending = files.map((file) => ({
      tempId: createTempId(),
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }))

    setPendingUploads((current) => [...current, ...newPending])

    requestAnimationFrame(() => {
      processPendingUploads(newPending)
    })
  }

  const handleRemovePending = (tempId: string) => {
    canceledUploads.current.add(tempId)
    setPendingUploads((current) => {
      const target = current.find((item) => item.tempId === tempId)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return current.filter((item) => item.tempId !== tempId)
    })
  }

  const pendingAttachments: PendingAttachment[] = pendingUploads.map((upload) => ({
    tempId: upload.tempId,
    name: upload.file.name,
    sizeBytes: upload.file.size,
    mimeType: upload.file.type || "application/octet-stream",
    previewUrl: upload.previewUrl,
  }))

  const canSend = !disabled && pendingUploads.length === 0 && (value.trim().length > 0 || attachments.length > 0)

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [value, adjustTextareaHeight])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
  }

  return (
    <div className="relative">
      <MentionAutocomplete
        options={mentionOptions}
        visible={showAutocomplete}
        activeIndex={activeIndex}
        onSelect={handleSelectOption}
        onHover={setActiveIndex}
      />

      {/* Attachments above the input */}
      {(attachments.length > 0 || pendingUploads.length > 0) && (
        <div className="mb-2">
          <AttachmentList
            attachments={attachments}
            pendingAttachments={pendingAttachments}
            onRemove={(fileId) => setAttachments((current) => current.filter((attachment) => attachment.id !== fileId))}
            onRemovePending={handleRemovePending}
            compact
          />
        </div>
      )}

      {pendingUploads.length > 0 && (
        <div className="mb-2 text-xs text-muted-foreground">Uploading attachments...</div>
      )}

      {uploadErrors.length > 0 && (
        <div className="mb-2 text-xs text-destructive">
          {uploadErrors[uploadErrors.length - 1]?.message}
        </div>
      )}

      {/* ChatGPT-style input container */}
      <div className="relative flex items-end rounded-3xl border border-border bg-background shadow-sm">
        {/* Attachment button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Add attachment"
          className="absolute left-2 bottom-2 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Channel is archived" : "Message..."}
          disabled={disabled}
          rows={1}
          className={cn(
            "w-full resize-none bg-transparent py-3 pl-12 pr-12 text-base leading-6 placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            "max-h-[200px] overflow-y-auto"
          )}
        />

        {/* Send button */}
        <Button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          aria-label="Send message"
          className={cn(
            "absolute right-2 bottom-2 h-8 w-8 rounded-full transition-opacity",
            canSend ? "opacity-100" : "opacity-40"
          )}
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
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
