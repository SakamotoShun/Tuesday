import { useState } from "react"
import { meetingsApi } from "@/api/meetings"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Meeting } from "@/api/types"

interface MeetingDetailProps {
  meeting: Meeting
  onEdit?: () => void
}

export function MeetingDetail({ meeting, onEdit }: MeetingDetailProps) {
  const [isJoining, setIsJoining] = useState(false)
  const contextLabel = meeting.project?.name ?? (meeting.projectId ? "Project meeting" : "Personal event")
  const meetingLink = meeting.link?.trim()

  const handleJoinMeeting = async () => {
    if (!meetingLink) return

    setIsJoining(true)
    try {
      const joinInfo = await meetingsApi.join(meeting.id)
      window.open(joinInfo.url, "_blank", "noopener,noreferrer")
    } catch {
      window.open(meetingLink, "_blank", "noopener,noreferrer")
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{meeting.title}</h3>
          <p className="text-sm text-muted-foreground">{contextLabel}</p>
          <p className="text-sm text-muted-foreground">
            {new Date(meeting.startTime).toLocaleString()} - {new Date(meeting.endTime).toLocaleString()}
          </p>
          {meeting.location ? (
            <p className="text-sm text-muted-foreground mt-1">{meeting.location}</p>
          ) : null}
          {meetingLink ? (
            <a
              href={meetingLink}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-sm text-primary hover:underline"
            >
              {meetingLink}
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {meetingLink ? (
            <Button size="sm" onClick={handleJoinMeeting} disabled={isJoining}>
              {isJoining ? "Joining..." : "Join Meeting"}
            </Button>
          ) : null}
          {onEdit ? (
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {meeting.notesMd ? (
        <div className="mt-4 text-sm whitespace-pre-wrap text-muted-foreground">
          {meeting.notesMd}
        </div>
      ) : null}
    </Card>
  )
}
