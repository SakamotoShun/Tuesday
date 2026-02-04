import { useEffect } from "react"

interface Shortcut {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  handler: () => void
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      shortcuts.forEach((shortcut) => {
        const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const matchesMeta = shortcut.metaKey ? event.metaKey : !shortcut.metaKey || !event.metaKey
        const matchesCtrl = shortcut.ctrlKey ? event.ctrlKey : !shortcut.ctrlKey || !event.ctrlKey
        const matchesShift = shortcut.shiftKey ? event.shiftKey : !shortcut.shiftKey || !event.shiftKey

        if (matchesKey && matchesMeta && matchesCtrl && matchesShift) {
          event.preventDefault()
          shortcut.handler()
        }
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [shortcuts])
}
