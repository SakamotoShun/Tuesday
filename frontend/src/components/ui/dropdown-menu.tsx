import * as React from "react"
import * as ReactDOM from "react-dom"
import { cn } from "@/lib/utils"
import { Slot } from "@radix-ui/react-slot"

interface DropdownMenuProps {
  children: React.ReactNode
}

const DropdownMenuContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
} | null>(null)

const useDropdownMenu = () => {
  const context = React.useContext(DropdownMenuContext)
  if (!context) {
    throw new Error("DropdownMenu components must be used within a DropdownMenu provider")
  }
  return context
}

function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </DropdownMenuContext.Provider>
  )
}

interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(({ onClick, asChild, ...props }, forwardedRef) => {
  const { open, setOpen, triggerRef } = useDropdownMenu()
  const Component = asChild ? Slot : "button"

  const handleRef = (node: HTMLButtonElement) => {
    triggerRef.current = node
    if (typeof forwardedRef === "function") {
      forwardedRef(node)
    } else if (forwardedRef) {
      forwardedRef.current = node
    }
  }

  return (
    <Component
      ref={handleRef}
      type={asChild ? undefined : "button"}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        setOpen(!open)
        onClick?.(e)
      }}
      {...props}
    />
  )
})
DropdownMenuTrigger.displayName = "DropdownMenuTrigger"

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { open, setOpen, triggerRef } = useDropdownMenu()
  const [position, setPosition] = React.useState({ top: -9999, left: -9999 })
  const [isPositioned, setIsPositioned] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)

  const updatePosition = React.useCallback(() => {
    if (!open || !triggerRef.current || !contentRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const contentRect = contentRef.current.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    const padding = 8

    let left = rect.right - contentRect.width
    let top = rect.bottom + 4

    if (left < padding) {
      left = padding
    }

    if (left + contentRect.width > viewportWidth - padding) {
      left = viewportWidth - padding - contentRect.width
    }

    if (top + contentRect.height > viewportHeight - padding) {
      const above = rect.top - contentRect.height - 4
      if (above >= padding) {
        top = above
      } else {
        top = Math.max(padding, viewportHeight - padding - contentRect.height)
      }
    }

    setPosition({
      top: top + window.scrollY,
      left: left + window.scrollX,
    })
    setIsPositioned(true)
  }, [open, triggerRef])

  React.useLayoutEffect(() => {
    if (!open) {
      setIsPositioned(false)
      return
    }

    updatePosition()
  }, [open, updatePosition])

  React.useEffect(() => {
    if (!open) return

    const handleResize = () => updatePosition()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [open, updatePosition])

  React.useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node) &&
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
  }, [open, setOpen, triggerRef])

  if (!open) return null

  return ReactDOM.createPortal(
    <div
      ref={(node) => {
        contentRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      }}
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        visibility: isPositioned ? "visible" : "hidden",
      }}
      className={cn(
        "z-50 w-56 overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-md",
        className
      )}
      {...props}
    />,
    document.body
  )
})
DropdownMenuContent.displayName = "DropdownMenuContent"

const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent hover:text-accent-foreground cursor-pointer",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = "DropdownMenuItem"

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = "DropdownMenuSeparator"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
}
