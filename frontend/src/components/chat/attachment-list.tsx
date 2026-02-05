import { FileText, X } from "lucide-react"
import type { FileAttachment } from "@/api/types"
import { Button } from "@/components/ui/button"

interface AttachmentListProps {
  attachments: FileAttachment[]
  onRemove?: (fileId: string) => void
  compact?: boolean
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function AttachmentList({ attachments, onRemove, compact = false }: AttachmentListProps) {
  if (attachments.length === 0) return null

  const thumbnailClass = compact ? "h-10 w-10" : "h-12 w-12"
  const nameClass = compact ? "text-xs" : "text-sm"

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith("image/")
        return (
          <div
            key={attachment.id}
            className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
          >
            {isImage ? (
              <div className={`${thumbnailClass} overflow-hidden rounded-md border border-border bg-muted`}>
                <img src={attachment.url} alt={attachment.originalName} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className={`flex ${thumbnailClass} items-center justify-center rounded-md border border-border bg-muted`}>
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className={`${nameClass} font-medium text-foreground truncate hover:underline`}
              >
                {attachment.originalName}
              </a>
              <div className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}</div>
            </div>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onRemove(attachment.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
