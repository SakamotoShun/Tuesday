import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { WidgetShell } from "@/components/home/widget-shell"

export type HomeWidgetId = "focus" | "notices" | "meetings" | "projects" | "chat"

export interface HomeWidgetLayoutItem {
  x: number
  y: number
  colSpan: number
  rowSpan: number
}

export interface HomeWidgetDefinition {
  id: HomeWidgetId
  title: string
  subtitle?: string
  content: ReactNode
  minColSpan?: number
  maxColSpan?: number
  minRowSpan?: number
  maxRowSpan?: number
  bodyClassName?: string
}

interface HomeWidgetBoardProps {
  widgets: HomeWidgetDefinition[]
  layout: Record<HomeWidgetId, HomeWidgetLayoutItem>
  hiddenWidgetIds: HomeWidgetId[]
  onLayoutChange: (layout: Record<HomeWidgetId, HomeWidgetLayoutItem>) => void
  onHideWidget: (id: HomeWidgetId) => void
}

const GRID_GAP = 16
const MAX_ROWS = 30
const BOARD_DROPPABLE_ID = "home-widget-board"

function getRowHeight(boardHeight: number, rowCount: number) {
  if (rowCount <= 1) {
    return Math.max(120, boardHeight)
  }

  return Math.max(72, (boardHeight - GRID_GAP * (rowCount - 1)) / rowCount)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function rectanglesOverlap(a: HomeWidgetLayoutItem, b: HomeWidgetLayoutItem) {
  const aRight = a.x + a.colSpan
  const aBottom = a.y + a.rowSpan
  const bRight = b.x + b.colSpan
  const bBottom = b.y + b.rowSpan

  return a.x < bRight && aRight > b.x && a.y < bBottom && aBottom > b.y
}

function clampRectToGrid(
  rect: HomeWidgetLayoutItem,
  definition: HomeWidgetDefinition,
  gridColumns: number
): HomeWidgetLayoutItem {
  const minColSpan = definition.minColSpan ?? 1
  const maxColSpan = definition.maxColSpan ?? 4
  const minRowSpan = definition.minRowSpan ?? 1
  const maxRowSpan = definition.maxRowSpan ?? 5

  const maxColSpanForViewport = Math.max(minColSpan, Math.min(maxColSpan, gridColumns))

  const colSpan = clamp(rect.colSpan, minColSpan, maxColSpanForViewport)
  const rowSpan = clamp(rect.rowSpan, minRowSpan, maxRowSpan)
  const maxX = Math.max(0, gridColumns - colSpan)

  return {
    x: clamp(rect.x, 0, maxX),
    y: Math.max(0, rect.y),
    colSpan,
    rowSpan,
  }
}

function isAreaFree(
  layout: Record<HomeWidgetId, HomeWidgetLayoutItem>,
  visibleWidgetIds: HomeWidgetId[],
  candidateId: HomeWidgetId,
  candidateRect: HomeWidgetLayoutItem,
  ignoredIds: HomeWidgetId[] = []
) {
  const ignored = new Set<HomeWidgetId>([candidateId, ...ignoredIds])

  return visibleWidgetIds.every((widgetId) => {
    if (ignored.has(widgetId)) {
      return true
    }

    const otherRect = layout[widgetId]
    if (!otherRect) {
      return true
    }

    return !rectanglesOverlap(candidateRect, otherRect)
  })
}

function findNearestOpenSpot(
  layout: Record<HomeWidgetId, HomeWidgetLayoutItem>,
  visibleWidgetIds: HomeWidgetId[],
  candidateId: HomeWidgetId,
  desiredRect: HomeWidgetLayoutItem,
  definition: HomeWidgetDefinition,
  gridColumns: number,
  ignoredIds: HomeWidgetId[] = []
) {
  const normalized = clampRectToGrid(desiredRect, definition, gridColumns)

  if (isAreaFree(layout, visibleWidgetIds, candidateId, normalized, ignoredIds)) {
    return normalized
  }

  let bestRect: HomeWidgetLayoutItem | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let y = 0; y <= MAX_ROWS; y += 1) {
    const maxX = Math.max(0, gridColumns - normalized.colSpan)

    for (let x = 0; x <= maxX; x += 1) {
      const rect = {
        ...normalized,
        x,
        y,
      }

      if (!isAreaFree(layout, visibleWidgetIds, candidateId, rect, ignoredIds)) {
        continue
      }

      const score = Math.abs(x - normalized.x) + Math.abs(y - normalized.y) * 1.5
      if (score < bestScore) {
        bestRect = rect
        bestScore = score
      }
    }
  }

  return bestRect ?? normalized
}

function sortByGridPosition(
  aId: HomeWidgetId,
  bId: HomeWidgetId,
  layout: Record<HomeWidgetId, HomeWidgetLayoutItem>
) {
  const a = layout[aId]
  const b = layout[bId]

  if (!a || !b) return 0
  if (a.y === b.y) {
    return a.x - b.x
  }
  return a.y - b.y
}

function mergeVisibleLayout(
  current: Record<HomeWidgetId, HomeWidgetLayoutItem>,
  visible: Record<HomeWidgetId, HomeWidgetLayoutItem>
) {
  return {
    ...current,
    ...visible,
  }
}

function haveVisibleLayoutChanges(
  current: Record<HomeWidgetId, HomeWidgetLayoutItem>,
  next: Record<HomeWidgetId, HomeWidgetLayoutItem>,
  visibleWidgetIds: HomeWidgetId[]
) {
  return visibleWidgetIds.some((widgetId) => {
    const a = current[widgetId]
    const b = next[widgetId]

    if (!a || !b) {
      return a !== b
    }

    return a.x !== b.x || a.y !== b.y || a.colSpan !== b.colSpan || a.rowSpan !== b.rowSpan
  })
}

function sanitizeLayout(
  layout: Record<HomeWidgetId, HomeWidgetLayoutItem>,
  visibleWidgetIds: HomeWidgetId[],
  widgetMap: Record<HomeWidgetId, HomeWidgetDefinition>,
  gridColumns: number
) {
  const sortedWidgetIds = [...visibleWidgetIds].sort((a, b) => sortByGridPosition(a, b, layout))

  const placed: Partial<Record<HomeWidgetId, HomeWidgetLayoutItem>> = {}

  sortedWidgetIds.forEach((widgetId, index) => {
    const definition = widgetMap[widgetId]
    if (!definition) {
      return
    }

    const fallbackRect: HomeWidgetLayoutItem = {
      x: 0,
      y: index,
      colSpan: definition.minColSpan ?? 1,
      rowSpan: definition.minRowSpan ?? 1,
    }

    const desiredRect = layout[widgetId] ?? fallbackRect
    const compactedDesiredRect = {
      ...desiredRect,
      y: 0,
    }
    const interim = placed as Record<HomeWidgetId, HomeWidgetLayoutItem>
    const nextRect = findNearestOpenSpot(
      interim,
      sortedWidgetIds,
      widgetId,
      compactedDesiredRect,
      definition,
      gridColumns
    )

    placed[widgetId] = nextRect
  })

  return placed as Record<HomeWidgetId, HomeWidgetLayoutItem>
}

interface DraggableWidgetProps {
  widget: HomeWidgetDefinition
  rect: HomeWidgetLayoutItem
  visibleWidgetIds: HomeWidgetId[]
  fullLayout: Record<HomeWidgetId, HomeWidgetLayoutItem>
  widgetMap: Record<HomeWidgetId, HomeWidgetDefinition>
  gridColumns: number
  rowCount: number
  boardRef: RefObject<HTMLDivElement | null>
  onLayoutChange: (layout: Record<HomeWidgetId, HomeWidgetLayoutItem>) => void
  onHideWidget: (id: HomeWidgetId) => void
}

function DraggableWidget({
  widget,
  rect,
  visibleWidgetIds,
  fullLayout,
  widgetMap,
  gridColumns,
  rowCount,
  boardRef,
  onLayoutChange,
  onHideWidget,
}: DraggableWidgetProps) {
  const [isResizing, setIsResizing] = useState(false)
  const widgetRef = useRef<HTMLDivElement | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: widget.id,
    disabled: gridColumns === 1 || isResizing,
  })

  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: widget.id,
    disabled: false,
  })

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      widgetRef.current = node
      setDraggableNodeRef(node)
      setDroppableNodeRef(node)
    },
    [setDraggableNodeRef, setDroppableNodeRef]
  )

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (gridColumns === 1) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const boardElement = boardRef.current
      const widgetElement = widgetRef.current
      if (!boardElement || !widgetElement) {
        return
      }

      const pointerTarget = event.currentTarget
      const pointerId = event.pointerId

      if (pointerTarget.setPointerCapture) {
        pointerTarget.setPointerCapture(pointerId)
      }

      setIsResizing(true)

      const boardRect = boardElement.getBoundingClientRect()
      const widgetRect = widgetElement.getBoundingClientRect()
      const columnWidth =
        gridColumns > 1
          ? (boardRect.width - GRID_GAP * (gridColumns - 1)) / gridColumns
          : boardRect.width
      const rowHeight = getRowHeight(boardRect.height, rowCount)

      const minCol = widget.minColSpan ?? 1
      const maxCol = Math.max(minCol, Math.min(widget.maxColSpan ?? 4, gridColumns))
      const minRow = widget.minRowSpan ?? 1
      const maxRow = widget.maxRowSpan ?? 5

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const relativeX = Math.max(0, moveEvent.clientX - widgetRect.left)
        const relativeY = Math.max(0, moveEvent.clientY - widgetRect.top)

        const nextColSpan = clamp(
          Math.round((relativeX + GRID_GAP) / (columnWidth + GRID_GAP)),
          minCol,
          maxCol
        )
        const nextRowSpan = clamp(
          Math.round((relativeY + GRID_GAP) / (rowHeight + GRID_GAP)),
          minRow,
          maxRow
        )

        const candidate = {
          ...rect,
          colSpan: nextColSpan,
          rowSpan: nextRowSpan,
          x: clamp(rect.x, 0, Math.max(0, gridColumns - nextColSpan)),
        }

        if (!isAreaFree(fullLayout, visibleWidgetIds, widget.id, candidate)) {
          return
        }

        onLayoutChange({
          ...fullLayout,
          [widget.id]: candidate,
        })
      }

      const endResize = () => {
        setIsResizing(false)
        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", endResize)
        document.removeEventListener("pointercancel", endResize)

        if (pointerTarget.hasPointerCapture?.(pointerId)) {
          pointerTarget.releasePointerCapture(pointerId)
        }
      }

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", endResize)
      document.addEventListener("pointercancel", endResize)
    },
    [boardRef, fullLayout, gridColumns, onLayoutChange, rect, rowCount, visibleWidgetIds, widget]
  )

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    gridColumn: `${rect.x + 1} / span ${rect.colSpan}`,
    gridRow: `${rect.y + 1} / span ${gridColumns === 1 ? 1 : rect.rowSpan}`,
    opacity: isDragging || isResizing ? 0.75 : 1,
    zIndex: isDragging ? 20 : "auto",
  }

  return (
    <div
      ref={setRefs}
      style={style}
      className={[
        "min-h-0",
        isOver && !isDragging ? "ring-1 ring-primary/45 ring-offset-2 ring-offset-background" : "",
      ].join(" ")}
    >
      <WidgetShell
        title={widget.title}
        subtitle={widget.subtitle}
        dragHandleProps={{ ...attributes, ...listeners }}
        onHide={() => onHideWidget(widget.id)}
        onResizeStart={handleResizeStart}
        bodyClassName={widget.bodyClassName}
      >
        {widget.content}
      </WidgetShell>
    </div>
  )
}

export function HomeWidgetBoard({
  widgets,
  layout,
  hiddenWidgetIds,
  onLayoutChange,
  onHideWidget,
}: HomeWidgetBoardProps) {
  const [activeWidgetId, setActiveWidgetId] = useState<HomeWidgetId | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [gridColumns, setGridColumns] = useState(() => {
    if (typeof window === "undefined") return 4
    if (window.innerWidth >= 1024) return 4
    if (window.innerWidth >= 768) return 2
    return 1
  })

  const { setNodeRef: setBoardDroppableRef } = useDroppable({ id: BOARD_DROPPABLE_ID })

  const setBoardRefs = useCallback(
    (node: HTMLDivElement | null) => {
      boardRef.current = node
      setBoardDroppableRef(node)
    },
    [setBoardDroppableRef]
  )

  useEffect(() => {
    const updateGridColumns = () => {
      if (window.innerWidth >= 1024) {
        setGridColumns(4)
        return
      }

      if (window.innerWidth >= 768) {
        setGridColumns(2)
        return
      }

      setGridColumns(1)
    }

    updateGridColumns()
    window.addEventListener("resize", updateGridColumns)
    return () => window.removeEventListener("resize", updateGridColumns)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const widgetMap = useMemo(() => {
    return widgets.reduce<Record<HomeWidgetId, HomeWidgetDefinition>>((acc, widget) => {
      acc[widget.id] = widget
      return acc
    }, {} as Record<HomeWidgetId, HomeWidgetDefinition>)
  }, [widgets])

  const visibleWidgetIds = useMemo(
    () => widgets.map((widget) => widget.id).filter((id) => !hiddenWidgetIds.includes(id)),
    [hiddenWidgetIds, widgets]
  )

  const sanitizedVisibleLayout = useMemo(
    () => sanitizeLayout(layout, visibleWidgetIds, widgetMap, gridColumns),
    [gridColumns, layout, visibleWidgetIds, widgetMap]
  )

  const mergedLayout = useMemo(
    () => mergeVisibleLayout(layout, sanitizedVisibleLayout),
    [layout, sanitizedVisibleLayout]
  )

  useEffect(() => {
    if (!haveVisibleLayoutChanges(layout, mergedLayout, visibleWidgetIds)) {
      return
    }

    onLayoutChange(mergedLayout)
  }, [layout, mergedLayout, onLayoutChange, visibleWidgetIds])

  const orderedVisibleIds = useMemo(
    () => [...visibleWidgetIds].sort((a, b) => sortByGridPosition(a, b, mergedLayout)),
    [mergedLayout, visibleWidgetIds]
  )

  const rowCount = useMemo(() => {
    const maxEnd = orderedVisibleIds.reduce((maxValue, widgetId) => {
      const rect = mergedLayout[widgetId]
      if (!rect) {
        return maxValue
      }

      const rectEnd = rect.y + (gridColumns === 1 ? 1 : rect.rowSpan)
      return Math.max(maxValue, rectEnd)
    }, 1)

    return Math.max(1, maxEnd)
  }, [gridColumns, mergedLayout, orderedVisibleIds])

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args)

    if (pointerCollisions.length > 0) {
      const widgetCollisions = pointerCollisions.filter(({ id }) => id !== BOARD_DROPPABLE_ID)
      if (widgetCollisions.length > 0) {
        return widgetCollisions
      }

      const boardCollision = pointerCollisions.find(({ id }) => id === BOARD_DROPPABLE_ID)
      if (boardCollision) {
        return [boardCollision]
      }
    }

    return rectIntersection(args)
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveWidgetId(event.active.id as HomeWidgetId)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = event.active.id as HomeWidgetId
    const overId = event.over?.id as HomeWidgetId | typeof BOARD_DROPPABLE_ID | undefined

    setActiveWidgetId(null)

    if (!visibleWidgetIds.includes(activeId)) {
      return
    }

    const activeRect = mergedLayout[activeId]
    if (!activeRect) {
      return
    }

    if (overId && overId !== BOARD_DROPPABLE_ID && overId !== activeId && visibleWidgetIds.includes(overId)) {
      const overRect = mergedLayout[overId]
      if (!overRect) {
        return
      }

      const activeDefinition = widgetMap[activeId]
      const overDefinition = widgetMap[overId]
      if (!activeDefinition || !overDefinition) {
        return
      }

      const nextLayout = { ...mergedLayout }

      const nextActiveRect = clampRectToGrid(
        {
          ...activeRect,
          x: overRect.x,
          y: overRect.y,
        },
        activeDefinition,
        gridColumns
      )

      if (!isAreaFree(nextLayout, visibleWidgetIds, activeId, nextActiveRect, [overId])) {
        return
      }

      nextLayout[activeId] = nextActiveRect

      const swappedOverRect = findNearestOpenSpot(
        nextLayout,
        visibleWidgetIds,
        overId,
        {
          ...overRect,
          x: activeRect.x,
          y: activeRect.y,
        },
        overDefinition,
        gridColumns,
        [activeId]
      )

      nextLayout[overId] = swappedOverRect
      onLayoutChange(nextLayout)
      return
    }

    if (!boardRef.current) {
      return
    }

    const boardRect = boardRef.current.getBoundingClientRect()
    const columnWidth =
      gridColumns > 1
        ? (boardRect.width - GRID_GAP * (gridColumns - 1)) / gridColumns
        : boardRect.width
    const rowHeight = getRowHeight(boardRect.height, rowCount)

    const initialRect = event.active.rect.current.initial
    if (!initialRect) {
      return
    }

    const translatedLeft = initialRect.left + event.delta.x
    const translatedTop = initialRect.top + event.delta.y

    const desiredX = clamp(
      Math.round((translatedLeft - boardRect.left) / (columnWidth + GRID_GAP)),
      0,
      Math.max(0, gridColumns - activeRect.colSpan)
    )

    const desiredY = clamp(
      Math.round((translatedTop - boardRect.top) / (rowHeight + GRID_GAP)),
      0,
      Math.min(MAX_ROWS, rowCount + 2)
    )

    const activeDefinition = widgetMap[activeId]
    if (!activeDefinition) {
      return
    }

    const nextRect = findNearestOpenSpot(
      mergedLayout,
      visibleWidgetIds,
      activeId,
      {
        ...activeRect,
        x: desiredX,
        y: desiredY,
      },
      activeDefinition,
      gridColumns
    )

    if (
      nextRect.x === activeRect.x &&
      nextRect.y === activeRect.y &&
      nextRect.colSpan === activeRect.colSpan &&
      nextRect.rowSpan === activeRect.rowSpan
    ) {
      return
    }

    onLayoutChange({
      ...mergedLayout,
      [activeId]: nextRect,
    })
  }

  if (visibleWidgetIds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
        All widgets are hidden. Restore one from the hidden widgets controls above.
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={setBoardRefs}
        className="grid h-full min-h-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
      >
        {orderedVisibleIds.map((widgetId) => {
          const widget = widgetMap[widgetId]
          const rect = mergedLayout[widgetId]

          if (!widget || !rect) {
            return null
          }

          return (
            <DraggableWidget
              key={widgetId}
              widget={widget}
              rect={rect}
              visibleWidgetIds={orderedVisibleIds}
              fullLayout={mergedLayout}
              widgetMap={widgetMap}
              gridColumns={gridColumns}
              rowCount={rowCount}
              boardRef={boardRef}
              onLayoutChange={onLayoutChange}
              onHideWidget={onHideWidget}
            />
          )
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeWidgetId ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-xl">
            {widgetMap[activeWidgetId]?.title ?? "Moving widget"}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
