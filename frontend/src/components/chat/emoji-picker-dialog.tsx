import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { SmilePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmojiPicker } from "@/components/chat/emoji-picker"
import { useUIStore } from "@/store/ui-store"

interface EmojiPickerDialogProps {
  onSelect: (emoji: string) => void
  disabled?: boolean
}

export function EmojiPickerDialog({ onSelect, disabled }: EmojiPickerDialogProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const themePreference = useUIStore((state) => state.theme)

  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (themePreference === "light" || themePreference === "dark") {
      return themePreference
    }
    if (typeof document === "undefined") return "light"
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
  }, [themePreference])

  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const panelWidth = panelRef.current?.offsetWidth ?? 320
    const panelHeight = panelRef.current?.offsetHeight ?? 360
    const margin = 12
    const alignRight = rect.right + scrollX - panelWidth
    const alignLeft = rect.left + scrollX
    const fitsRight = alignRight >= scrollX + margin
    const fitsLeft = alignLeft + panelWidth <= scrollX + window.innerWidth - margin
    let left = fitsRight ? alignRight : alignLeft
    let top = rect.bottom + scrollY + 6

    if (!fitsRight && !fitsLeft) {
      left = Math.min(
        Math.max(alignRight, scrollX + margin),
        scrollX + window.innerWidth - panelWidth - margin
      )
    }
    if (top + panelHeight > scrollY + window.innerHeight - margin) {
      top = rect.top + scrollY - panelHeight - 6
    }
    if (top < scrollY + margin) {
      top = scrollY + margin
    }

    setPosition({ top, left })
  }

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(updatePosition)
    const handleResize = () => updatePosition()
    window.addEventListener("resize", handleResize)
    window.addEventListener("scroll", handleResize, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("scroll", handleResize, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open])

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <SmilePlus className="h-4 w-4" />
      </Button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "absolute", top: position.top, left: position.left }}
            className="emoji-picker-panel z-50 rounded-lg border border-border bg-card p-2 shadow-lg"
          >
            <EmojiPicker
              onSelect={(emoji) => {
                onSelect(emoji)
                setOpen(false)
              }}
              theme={resolvedTheme}
            />
          </div>,
          document.body
        )}
    </>
  )
}
