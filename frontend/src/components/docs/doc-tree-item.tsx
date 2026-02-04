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
  level?: number
  onRename: (docId: string, title: string) => Promise<unknown>
  onDelete: (docId: string) => Promise<unknown>
}

export function DocTreeItem({
  doc,
  projectId,
  children,
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
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted/60",
          isEditing ? "bg-muted/50" : "cursor-pointer"
        )}
        style={{ paddingLeft: `${12 + level * 18}px` }}
        role="button"
        tabIndex={0}
        onClick={handleNavigate}
        onKeyDown={handleKeyDown}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation()
              setIsExpanded((value) => !value)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="h-5 w-5" />
        )}

        <Icon className="h-4 w-4 text-muted-foreground" />

        {isEditing ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="h-7"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  handleRename()
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
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                handleRename()
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                setIsEditing(false)
                setDraftTitle(doc.title)
                setError(null)
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <span className="flex-1 truncate">{doc.title}</span>
        )}

        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
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
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <DocTreeItem
              key={child.id}
              doc={child}
              projectId={projectId}
              children={[]}
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
