import type { Meeting } from "@/api/types"

interface UpcomingMeetingsProps {
  meetings: Meeting[]
}

export function UpcomingMeetings({ meetings }: UpcomingMeetingsProps) {
  if (meetings.length === 0) {
    return <div className="text-sm text-muted-foreground">No meetings coming up.</div>
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => (
        <div key={meeting.id} className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{meeting.title}</div>
            <div className="text-xs text-muted-foreground">
              {meeting.project?.name ?? "Project"}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(meeting.startTime).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
