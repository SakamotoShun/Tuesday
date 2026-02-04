import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarView } from "@/components/calendar/calendar-view"
import { MeetingDialog } from "@/components/calendar/meeting-dialog"
import { MeetingDetail } from "@/components/calendar/meeting-detail"
import { Skeleton } from "@/components/ui/skeleton"
import { useMyMeetings } from "@/hooks/use-meetings"
import { meetingsApi } from "@/api/meetings"
import type { Meeting, UpdateMeetingInput, User } from "@/api/types"

export function MyCalendarPage() {
  const { data: meetings = [], isLoading } = useMyMeetings()
  const queryClient = useQueryClient()

  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

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
      <div>
        <h2 className="text-lg font-semibold">My Calendar</h2>
        <p className="text-sm text-muted-foreground">All your meetings across projects.</p>
      </div>

      <CalendarView
        meetings={meetings}
        onSelectDate={() => {}}
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
        members={
          selectedMeeting?.attendees
            ?.map((attendee) => attendee.user)
            .filter((user): user is User => Boolean(user)) ?? []
        }
        isSubmitting={updateMeeting.isPending || deleteMeeting.isPending}
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
          if (!selectedMeeting) return
          await updateMeeting.mutateAsync({
            meetingId: selectedMeeting.id,
            data: data as UpdateMeetingInput,
          })
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
