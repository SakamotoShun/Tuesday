import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Meeting } from "@/api/types"

interface MeetingDetailProps {
  meeting: Meeting
  onEdit: () => void
}

export function MeetingDetail({ meeting, onEdit }: MeetingDetailProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{meeting.title}</h3>
          <p className="text-sm text-muted-foreground">
            {new Date(meeting.startTime).toLocaleString()} - {new Date(meeting.endTime).toLocaleString()}
          </p>
          {meeting.location ? (
            <p className="text-sm text-muted-foreground mt-1">{meeting.location}</p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>

      {meeting.notesMd ? (
        <div className="mt-4 text-sm whitespace-pre-wrap text-muted-foreground">
          {meeting.notesMd}
        </div>
      ) : null}
    </Card>
  )
}
