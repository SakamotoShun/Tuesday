import { useMemo, useState } from "react"
import { CalendarView } from "@/components/calendar/calendar-view"
import { MeetingDialog } from "@/components/calendar/meeting-dialog"
import { MeetingDetail } from "@/components/calendar/meeting-detail"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMeetings } from "@/hooks/use-meetings"
import { useProject } from "@/hooks/use-projects"
import type { Meeting, CreateMeetingInput, UpdateMeetingInput, User } from "@/api/types"

interface ProjectSchedulePageProps {
  projectId: string
}

const withHourOffset = (date: Date, hours: number) => {
  const next = new Date(date)
  next.setHours(next.getHours() + hours)
  return next
}

export function ProjectSchedulePage({ projectId }: ProjectSchedulePageProps) {
  const { data: project } = useProject(projectId)
  const { meetings, isLoading, createMeeting, updateMeeting, deleteMeeting } = useMeetings(projectId)

  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftStart, setDraftStart] = useState<Date | null>(null)
  const [draftEnd, setDraftEnd] = useState<Date | null>(null)

  const members: User[] = project?.members
    ?.map((member) => member.user)
    .filter((user): user is User => user !== undefined) || []

  const defaultDate = useMemo(() => new Date(), [])

  const openCreateDialog = (startDate?: Date) => {
    const base = startDate ?? defaultDate
    const start = new Date(base)
    start.setMinutes(0, 0, 0)
    start.setHours(9)
    const end = withHourOffset(start, 1)
    setDraftStart(start)
    setDraftEnd(end)
    setSelectedMeeting(null)
    setDialogOpen(true)
  }

  const handleSelectMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Project Schedule</h2>
          <p className="text-sm text-muted-foreground">Plan meetings with your team.</p>
        </div>
        <Button onClick={() => openCreateDialog()}>Schedule Meeting</Button>
      </div>

      <CalendarView
        meetings={meetings}
        onSelectDate={(date) => openCreateDialog(date)}
        onSelectMeeting={handleSelectMeeting}
      />

      {selectedMeeting ? (
        <MeetingDetail meeting={selectedMeeting} onEdit={() => setDialogOpen(true)} />
      ) : null}

      <MeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={selectedMeeting}
        initialStartTime={draftStart}
        initialEndTime={draftEnd}
        members={members}
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
