import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarView } from "@/components/calendar/calendar-view"
import { MeetingDialog } from "@/components/calendar/meeting-dialog"
import { MeetingDetail } from "@/components/calendar/meeting-detail"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMyMeetings } from "@/hooks/use-meetings"
import { useWorkspaceUsers } from "@/hooks/use-project-members"
import { useTeams } from "@/hooks/use-teams"
import { meetingsApi } from "@/api/meetings"
import type { CreateMeetingInput, Meeting, UpdateMeetingInput } from "@/api/types"

const withHourOffset = (date: Date, hours: number) => {
  const next = new Date(date)
  next.setHours(next.getHours() + hours)
  return next
}

export function MyCalendarPage() {
  const { data: meetings = [], isLoading } = useMyMeetings()
  const { data: users = [], isLoading: isUsersLoading } = useWorkspaceUsers()
  const { teams, isLoading: isTeamsLoading } = useTeams()
  const queryClient = useQueryClient()

  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftStart, setDraftStart] = useState<Date | null>(null)
  const [draftEnd, setDraftEnd] = useState<Date | null>(null)

  const defaultDate = useMemo(() => new Date(), [])

  const openCreateDialog = (startDate?: Date, allDay = true) => {
    const base = startDate ?? defaultDate
    const start = new Date(base)
    if (allDay) {
      start.setMinutes(0, 0, 0)
      start.setHours(9)
    } else {
      start.setSeconds(0, 0)
    }

    setDraftStart(start)
    setDraftEnd(withHourOffset(start, 1))
    setSelectedMeeting(null)
    setDialogOpen(true)
  }

  const createMeeting = useMutation({
    mutationFn: (data: CreateMeetingInput) => meetingsApi.createStandalone(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", "my"] })
    },
  })

  const updateMeeting = useMutation({
    mutationFn: ({ meetingId, data }: { meetingId: string; data: UpdateMeetingInput }) =>
      meetingsApi.update(meetingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", "my"] })
    },
  })

  const deleteMeeting = useMutation({
    mutationFn: (meetingId: string) => meetingsApi.delete(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", "my"] })
    },
  })

  if (isLoading || isUsersLoading || isTeamsLoading) {
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
          <h2 className="text-lg font-semibold">My Calendar</h2>
          <p className="text-sm text-muted-foreground">All your meetings and events.</p>
        </div>
        <Button onClick={() => openCreateDialog()}>Create Event</Button>
      </div>

      <CalendarView
        meetings={meetings}
        onSelectDate={(date, allDay) => openCreateDialog(date, allDay)}
        onSelectMeeting={(meeting) => setSelectedMeeting(meeting)}
        showProject
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
