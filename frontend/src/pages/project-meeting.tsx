import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { MeetingDialog } from "@/components/calendar/meeting-dialog"
import { useMeetings } from "@/hooks/use-meetings"
import { useWorkspaceUsers } from "@/hooks/use-project-members"
import { useTeams } from "@/hooks/use-teams"
import type { Meeting, CreateMeetingInput, UpdateMeetingInput } from "@/api/types"
import { format, isPast, isSameDay } from "date-fns"

interface ProjectMeetingPageProps {
  projectId: string
}

const withHourOffset = (date: Date, hours: number) => {
  const next = new Date(date)
  next.setHours(next.getHours() + hours)
  return next
}

export function ProjectMeetingPage({ projectId }: ProjectMeetingPageProps) {
  const { meetings, isLoading, createMeeting, updateMeeting, deleteMeeting } = useMeetings(projectId)
  const { data: users = [], isLoading: isUsersLoading } = useWorkspaceUsers()
  const { teams, isLoading: isTeamsLoading } = useTeams()

  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftStart, setDraftStart] = useState<Date | null>(null)
  const [draftEnd, setDraftEnd] = useState<Date | null>(null)
  const [selectedMeetingForZoom, setSelectedMeetingForZoom] = useState<Meeting | null>(null)

  const defaultDate = useMemo(() => new Date(), [])

  // Separate upcoming and past meetings
  const { upcomingMeetings, pastMeetings } = useMemo(() => {
    const now = new Date()
    const upcoming = meetings
      .filter((m) => new Date(m.endTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    const past = meetings
      .filter((m) => new Date(m.endTime) <= now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    return { upcomingMeetings: upcoming, pastMeetings: past }
  }, [meetings])

  const openCreateDialog = () => {
    const start = new Date(defaultDate)
    start.setSeconds(0, 0)
    const end = withHourOffset(start, 1)
    setDraftStart(start)
    setDraftEnd(end)
    setSelectedMeeting(null)
    setDialogOpen(true)
  }

  const handleSelectMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting)
    setSelectedMeetingForZoom(meeting)
  }

  const handleEditMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting)
    setDraftStart(new Date(meeting.startTime))
    setDraftEnd(new Date(meeting.endTime))
    setDialogOpen(true)
  }

  if (isLoading || isUsersLoading || isTeamsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
      {/* Meeting List */}
      <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between sticky top-0 bg-background z-10 pb-4">
          <h2 className="text-lg font-semibold">Meetings</h2>
          <Button size="sm" onClick={openCreateDialog}>
            Schedule
          </Button>
        </div>

        {/* Upcoming Meetings */}
        {upcomingMeetings.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Upcoming
            </h3>
            {upcomingMeetings.map((meeting) => (
              <Card
                key={meeting.id}
                className={`p-3 cursor-pointer transition-all ${
                  selectedMeeting?.id === meeting.id
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                onClick={() => handleSelectMeeting(meeting)}
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm line-clamp-2">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(meeting.startTime), "MMM d, h:mm a")}
                  </p>
                  {meeting.link && (
                    <Badge variant="secondary" className="text-xs">
                      Zoom
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Past Meetings */}
        {pastMeetings.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Past
            </h3>
            {pastMeetings.map((meeting) => (
              <Card
                key={meeting.id}
                className={`p-3 cursor-pointer transition-all opacity-60 ${
                  selectedMeeting?.id === meeting.id
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                onClick={() => handleSelectMeeting(meeting)}
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm line-clamp-2">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(meeting.startTime), "MMM d, h:mm a")}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {meetings.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">No meetings scheduled</p>
            <Button onClick={openCreateDialog} variant="outline" size="sm">
              Schedule First Meeting
            </Button>
          </div>
        )}
      </div>

      {/* Meeting Detail / Zoom View */}
      <div className="lg:col-span-2 flex flex-col">
        {selectedMeetingForZoom ? (
          <div className="space-y-4 h-full flex flex-col">
            {/* Meeting Header */}
            <Card className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-2xl font-bold mb-2">{selectedMeetingForZoom.title}</h1>
                  <p className="text-muted-foreground mb-2">
                    {format(new Date(selectedMeetingForZoom.startTime), "EEEE, MMMM d, yyyy")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedMeetingForZoom.startTime), "h:mm a")} -{" "}
                    {format(new Date(selectedMeetingForZoom.endTime), "h:mm a")}
                  </p>
                </div>
                <div className="space-x-2">
                  <Button onClick={() => handleEditMeeting(selectedMeetingForZoom)} variant="outline">
                    Edit
                  </Button>
                  <Button
                    onClick={async () => {
                      await deleteMeeting.mutateAsync(selectedMeetingForZoom.id)
                      setSelectedMeeting(null)
                      setSelectedMeetingForZoom(null)
                    }}
                    variant="destructive"
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {selectedMeetingForZoom.location && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Location
                  </p>
                  <p className="text-sm">{selectedMeetingForZoom.location}</p>
                </div>
              )}

              {selectedMeetingForZoom.notesMd && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Notes
                  </p>
                  <p className="text-sm">{selectedMeetingForZoom.notesMd}</p>
                </div>
              )}

              {selectedMeetingForZoom.attendees && selectedMeetingForZoom.attendees.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Attendees
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedMeetingForZoom.attendees.map((attendee) => (
                      <Badge key={attendee.userId} variant="outline">
                        {attendee.user?.name || "Unknown"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Zoom Embedded Widget or Link */}
            {selectedMeetingForZoom.link ? (
              <Card className="flex-1 p-6 flex flex-col">
                <h3 className="text-lg font-semibold mb-4">Meeting Room</h3>
                <div className="flex-1 flex flex-col">
                  <div className="bg-muted flex items-center justify-center rounded-lg mb-4 aspect-video">
                    <p className="text-sm text-muted-foreground">
                      Zoom embedded view will load here
                    </p>
                  </div>
                  <a
                    href={selectedMeetingForZoom.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                  >
                    <Button>Join Meeting</Button>
                  </a>
                  <p className="text-xs text-muted-foreground mt-2">
                    Meeting link:{" "}
                    <span className="font-mono break-all">{selectedMeetingForZoom.link}</span>
                  </p>
                </div>
              </Card>
            ) : (
              <Card className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">
                    No Zoom meeting linked yet. Edit the meeting to add a Zoom link.
                  </p>
                  <Button onClick={() => handleEditMeeting(selectedMeetingForZoom)}>
                    Add Zoom Link
                  </Button>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Card className="p-12 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">Select a meeting to view details</p>
              <Button onClick={openCreateDialog}>Schedule a Meeting</Button>
            </div>
          </Card>
        )}
      </div>

      {/* Meeting Dialog for Create/Edit */}
      <MeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={selectedMeeting}
        initialStartTime={draftStart}
        initialEndTime={draftEnd}
        members={users}
        teams={teams}
        isSubmitting={createMeeting.isPending || updateMeeting.isPending || deleteMeeting.isPending}
        onDelete={
          selectedMeeting
            ? async () => {
                await deleteMeeting.mutateAsync(selectedMeeting.id)
                setSelectedMeeting(null)
                setDialogOpen(false)
              }
            : null
        }
        onSubmit={async (data) => {
          if (selectedMeeting) {
            await updateMeeting.mutateAsync({
              meetingId: selectedMeeting.id,
              data: data as UpdateMeetingInput,
            })
          } else {
            await createMeeting.mutateAsync(data as CreateMeetingInput)
          }
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
