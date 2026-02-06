import { useEffect, useState } from "react"
import type { KeyboardEvent } from "react"
import { useNavigate } from "react-router-dom"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  MoreHorizontal,
  Pencil,
  Table,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ApiErrorResponse } from "@/api/client"
import type { Doc } from "@/api/types"
import { cn } from "@/lib/utils"

interface DocTreeItemProps {
  doc: Doc
  projectId: string
  children: Doc[]
  childrenByParent?: Map<string, Doc[]>
  activeDocId?: string
  level?: number
  onRename: (docId: string, title: string) => Promise<unknown>
  onDelete: (docId: string) => Promise<unknown>
}

export function DocTreeItem({
  doc,
  projectId,
  children,
  childrenByParent,
  activeDocId,
  level = 0,
  onRename,
  onDelete,
}: DocTreeItemProps) {
  const navigate = useNavigate()
  const [isExpanded, setIsExpanded] = useState(children.length > 0)
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(doc.title)
  const [error, setError] = useState<string | null>(null)
  const hasChildren = children.length > 0
  const leftPadding = 8 + level * 16

  useEffect(() => {
    if (children.length > 0 && !isExpanded) {
      setIsExpanded(true)
    }
  }, [children.length, isExpanded])

  const Icon = doc.isDatabase ? Table : hasChildren ? Folder : FileText

  const handleNavigate = () => {
    if (isEditing) return
    navigate(`/projects/${projectId}/docs/${doc.id}`)
  }

  const handleRename = async () => {
    const trimmed = draftTitle.trim()
    if (!trimmed) {
      setError("Title is required")
      return
    }

    if (trimmed === doc.title) {
      setIsEditing(false)
      setError(null)
      return
    }

    try {
      setError(null)
      await onRename(doc.id, trimmed)
      setIsEditing(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to rename doc")
      }
    }
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete "${doc.title}"? This cannot be undone.`)
    if (!confirmed) return

    try {
      setError(null)
      await onDelete(doc.id)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to delete doc")
      }
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      handleNavigate()
    }
  }

  return (
    <div className="relative">
      {level > 0 &&
        Array.from({ length: level }).map((_, index) => (
          <span
            key={`${doc.id}-guide-${index}`}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-border/70"
            style={{ left: `${8 + index * 16 + 7}px` }}
          />
        ))}
      <div
        className={cn(
          "group relative flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors",
          isEditing
            ? "bg-muted/50"
            : doc.id === activeDocId
              ? "cursor-pointer bg-accent text-accent-foreground"
              : "cursor-pointer hover:bg-muted"
        )}
        style={{ paddingLeft: `${leftPadding}px` }}
        role="button"
        tabIndex={0}
        onClick={handleNavigate}
        onKeyDown={handleKeyDown}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
            onClick={(event) => {
              event.stopPropagation()
              setIsExpanded((value) => !value)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        <Icon className="h-3.5 w-3.5 shrink-0" />

        {isEditing ? (
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="h-7 text-sm"
              onClick={(event) => event.stopPropagation()}
              onBlur={() => {
                void handleRename()
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void handleRename()
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setIsEditing(false)
                  setDraftTitle(doc.title)
                  setError(null)
                }
              }}
              autoFocus
            />
          </div>
        ) : (
          <span className="flex-1 truncate leading-6 font-medium">{doc.title}</span>
        )}

        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation()
                  setIsEditing(true)
                  setDraftTitle(doc.title)
                  setError(null)
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(event) => {
                  event.stopPropagation()
                  handleDelete()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {error && (
        <div
          className="px-2 pb-1 text-xs text-destructive"
          style={{ paddingLeft: `${32 + level * 18}px` }}
        >
          {error}
        </div>
      )}
      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <DocTreeItem
              key={child.id}
              doc={child}
              projectId={projectId}
              children={childrenByParent?.get(child.id) ?? []}
              childrenByParent={childrenByParent}
              activeDocId={activeDocId}
              level={level + 1}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
