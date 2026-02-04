import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AttendeePicker } from "@/components/calendar/attendee-picker"
import type { Meeting, CreateMeetingInput, UpdateMeetingInput, User } from "@/api/types"

interface MeetingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  meeting?: Meeting | null
  initialStartTime?: Date | null
  initialEndTime?: Date | null
  members: User[]
  onSubmit: (data: CreateMeetingInput | UpdateMeetingInput) => Promise<void>
  onDelete?: (() => Promise<void>) | null
  isSubmitting?: boolean
}

const toInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const splitDateTime = (value: string) => {
  const [datePart = "", timePart = ""] = value.split("T")
  return { datePart, timePart }
}

const mergeDateTime = (current: string, next: { date?: string; time?: string }) => {
  const { datePart, timePart } = splitDateTime(current)
  const mergedDate = next.date ?? datePart
  const mergedTime = next.time ?? timePart
  if (!mergedDate) return ""
  return `${mergedDate}T${mergedTime || "00:00"}`
}

export function MeetingDialog({
  open,
  onOpenChange,
  meeting,
  initialStartTime,
  initialEndTime,
  members,
  onSubmit,
  onDelete,
  isSubmitting,
}: MeetingDialogProps) {
  const isEdit = Boolean(meeting)

  const defaultStart = useMemo(() => {
    if (meeting) return new Date(meeting.startTime)
    return initialStartTime ?? new Date()
  }, [meeting, initialStartTime])

  const defaultEnd = useMemo(() => {
    if (meeting) return new Date(meeting.endTime)
    if (initialEndTime) return initialEndTime
    const next = new Date(defaultStart)
    next.setHours(next.getHours() + 1)
    return next
  }, [meeting, initialEndTime, defaultStart])

  const [title, setTitle] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [location, setLocation] = useState("")
  const [notes, setNotes] = useState("")
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])

  const startParts = splitDateTime(startTime)
  const endParts = splitDateTime(endTime)

  useEffect(() => {
    if (!open) return
    setTitle(meeting?.title ?? "")
    setStartTime(toInputValue(defaultStart))
    setEndTime(toInputValue(defaultEnd))
    setLocation(meeting?.location ?? "")
    setNotes(meeting?.notesMd ?? "")
    setAttendeeIds(meeting?.attendees?.map((attendee) => attendee.userId) ?? [])
  }, [open, meeting, defaultStart, defaultEnd])

  const handleSubmit = async () => {
    if (!title.trim()) return

    await onSubmit({
      title: title.trim(),
      startTime,
      endTime,
      location: location.trim() || undefined,
      notesMd: notes || undefined,
      attendeeIds,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Meeting" : "Schedule Meeting"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Weekly sync" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start date</label>
              <Input
                type="date"
                value={startParts.datePart}
                onChange={(event) => setStartTime(mergeDateTime(startTime, { date: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Start time</label>
              <Input
                type="time"
                value={startParts.timePart}
                onChange={(event) => setStartTime(mergeDateTime(startTime, { time: event.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">End date</label>
              <Input
                type="date"
                value={endParts.datePart}
                onChange={(event) => setEndTime(mergeDateTime(endTime, { date: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End time</label>
              <Input
                type="time"
                value={endParts.timePart}
                onChange={(event) => setEndTime(mergeDateTime(endTime, { time: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Location</label>
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Conference Room A" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
          </div>

          <AttendeePicker members={members} selectedIds={attendeeIds} onChange={setAttendeeIds} />
        </div>

        <DialogFooter className="flex items-center justify-between">
          {isEdit && onDelete ? (
            <Button variant="destructive" onClick={onDelete} disabled={isSubmitting}>
              Delete
            </Button>
          ) : (
            <div />
          )}
          <Button onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
            {isEdit ? "Save changes" : "Create meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
