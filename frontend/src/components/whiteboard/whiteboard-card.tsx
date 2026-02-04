import { Link } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Whiteboard } from "@/api/types"

interface WhiteboardCardProps {
  whiteboard: Whiteboard
  onDelete: (id: string) => Promise<void>
}

export function WhiteboardCard({ whiteboard, onDelete }: WhiteboardCardProps) {
  return (
    <Card className="p-4 flex flex-col justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Whiteboard</div>
        <h3 className="text-lg font-semibold mt-1">{whiteboard.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Updated {new Date(whiteboard.updatedAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link to={`/whiteboards/${whiteboard.id}`}>Open</Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(whiteboard.id)}
        >
          Delete
        </Button>
      </div>
    </Card>
  )
}
