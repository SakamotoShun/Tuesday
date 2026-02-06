import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface ResizableSplitProps {
  children: React.ReactNode
  sidePanel: React.ReactNode
  sidePanelOpen: boolean
  sidePanelWidth: number
  onWidthChange: (width: number) => void
  minWidth?: number
  maxWidth?: number
}

export function ResizableSplit({
  children,
  sidePanel,
  sidePanelOpen,
  sidePanelWidth,
  onWidthChange,
  minWidth = 300,
  maxWidth = 600,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = containerRect.right - e.clientX
      const clampedWidth = Math.min(maxWidth, Math.max(minWidth, newWidth))
      onWidthChange(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, maxWidth, minWidth, onWidthChange])

  const gridTemplateColumns = sidePanelOpen
    ? `minmax(0, 1fr) 4px ${sidePanelWidth}px`
    : "minmax(0, 1fr)"

  return (
    <div
      ref={containerRef}
      className="grid min-h-0"
      style={{
        gridTemplateColumns,
        height: "100%",
      }}
    >
      <div className="min-w-0 min-h-0 overflow-y-auto">
        {children}
      </div>

      {sidePanelOpen && (
        <>
          <div
            className={cn(
              "cursor-col-resize bg-border hover:bg-primary/50 transition-colors",
              isDragging && "bg-primary"
            )}
            onMouseDown={handleMouseDown}
          />
          <div className="min-h-0 overflow-hidden border-l border-border bg-card flex flex-col">
            {sidePanel}
          </div>
        </>
      )}
    </div>
  )
}
