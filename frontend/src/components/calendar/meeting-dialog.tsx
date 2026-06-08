import { useEffect, useMemo, useState } from "react"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "@/lib/icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ItemCombobox } from "@/components/ui/item-combobox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AttendeePicker } from "@/components/calendar/attendee-picker"
import type { Meeting, CreateMeetingInput, MeetingVideoSettings, UpdateMeetingInput, Team, User } from "@/api/types"

interface MeetingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  meeting?: Meeting | null
  initialStartTime?: Date | null
  initialEndTime?: Date | null
  members: User[]
  teams?: Team[]
  videoSettings?: MeetingVideoSettings | null
  onSubmit: (data: CreateMeetingInput | UpdateMeetingInput) => Promise<void>
  onDelete?: (() => Promise<void>) | null
  isSubmitting?: boolean
}

const toInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const addMinutes = (value: string, minutes: number) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  date.setMinutes(date.getMinutes() + minutes)
  return toInputValue(date)
}

const splitDateTime = (value: string) => {
  const [datePart = "", timePart = ""] = value.split("T")
  return { datePart, timePart }
}

const getDurationMinutes = (start: string, end: string) => {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 60
  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000)
  return minutes > 0 ? minutes : 60
}

const durationOptions = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "90m", minutes: 90 },
  { label: "2h", minutes: 120 },
]

const hourOptions = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const minuteOptions = Array.from({ length: 12 }, (_, index) => index * 5)

const formatDateTimeLabel = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Select date and time"
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const toDatePart = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const isSameDay = (a: Date, b: Date) => (
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()
)

const getCalendarDays = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const startOffset = firstDay.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ]
}

interface DateTimePickerProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  minDate?: string
}

function DateTimePicker({ id, label, value, onChange, minDate }: DateTimePickerProps) {
  const selectedDate = new Date(value)
  const safeDate = Number.isNaN(selectedDate.getTime()) ? new Date() : selectedDate
  const [viewMonth, setViewMonth] = useState(() => new Date(safeDate.getFullYear(), safeDate.getMonth(), 1))
  const calendarDays = getCalendarDays(viewMonth)
  const selectedHour = safeDate.getHours() % 12 || 12
  const selectedMinute = safeDate.getMinutes()
  const selectedAmPm = safeDate.getHours() >= 12 ? "PM" : "AM"
  const minDay = minDate ? new Date(`${minDate}T00:00`) : null

  const updateDate = (next: Date) => onChange(toInputValue(next))

  const handleDateSelect = (date: Date) => {
    const next = new Date(safeDate)
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
    updateDate(next)
  }

  const handleHourSelect = (hour: number) => {
    const next = new Date(safeDate)
    next.setHours((hour % 12) + (selectedAmPm === "PM" ? 12 : 0))
    updateDate(next)
  }

  const handleMinuteSelect = (minute: number) => {
    const next = new Date(safeDate)
    next.setMinutes(minute)
    updateDate(next)
  }

  const handleAmPmSelect = (ampm: "AM" | "PM") => {
    const next = new Date(safeDate)
    const currentHour = next.getHours()
    if (ampm === "AM" && currentHour >= 12) {
      next.setHours(currentHour - 12)
    }
    if (ampm === "PM" && currentHour < 12) {
      next.setHours(currentHour + 12)
    }
    updateDate(next)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className="h-10 w-full justify-start font-normal">
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            {formatDateTimeLabel(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="flex flex-col sm:flex-row">
            <div className="w-[292px] p-3">
              <div className="mb-3 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium">
                  {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <div key={day}>{day}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, index) => {
                  const disabled = Boolean(day && minDay && day < minDay)
                  return day ? (
                    <Button
                      key={day.toISOString()}
                      type="button"
                      variant={isSameDay(day, safeDate) ? "default" : "ghost"}
                      size="icon"
                      disabled={disabled}
                      className="h-9 w-9"
                      onClick={() => handleDateSelect(day)}
                    >
                      {day.getDate()}
                    </Button>
                  ) : <div key={`empty-${index}`} />
                })}
              </div>
            </div>

            <div className="flex max-h-[340px] divide-x border-t sm:border-l sm:border-t-0">
              <div className="w-16 overflow-y-auto p-2">
                {hourOptions.map((hour) => (
                  <Button
                    key={hour}
                    type="button"
                    size="icon"
                    variant={selectedHour === hour ? "default" : "ghost"}
                    className="mb-1 h-9 w-full"
                    onClick={() => handleHourSelect(hour)}
                  >
                    {hour}
                  </Button>
                ))}
              </div>
              <div className="w-16 overflow-y-auto p-2">
                {minuteOptions.map((minute) => (
                  <Button
                    key={minute}
                    type="button"
                    size="icon"
                    variant={selectedMinute === minute ? "default" : "ghost"}
                    className="mb-1 h-9 w-full"
                    onClick={() => handleMinuteSelect(minute)}
                  >
                    {String(minute).padStart(2, "0")}
                  </Button>
                ))}
              </div>
              <div className="w-16 p-2">
                {(["AM", "PM"] as const).map((ampm) => (
                  <Button
                    key={ampm}
                    type="button"
                    size="icon"
                    variant={selectedAmPm === ampm ? "default" : "ghost"}
                    className="mb-1 h-9 w-full"
                    onClick={() => handleAmPmSelect(ampm)}
                  >
                    {ampm}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

const isGeneratedJaasLink = (meeting?: Meeting | null) => {
  const link = meeting?.link?.trim()
  return Boolean(link && link.includes("8x8.vc/"))
}

const slugifyRoomTitle = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")

  return slug || "meeting"
}

const generatePreviewPassphrase = () => {
  const words = ["cedar", "atlas", "river", "ember", "harbor", "signal", "orbit", "copper"]
  const first = words[Math.floor(Math.random() * words.length)]
  const second = words[Math.floor(Math.random() * words.length)]
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${first}-${second}-${suffix}`
}

const getStablePreviewSuffix = (meeting?: Meeting | null) => {
  return meeting?.id?.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6) || "abc123"
}

export function MeetingDialog({
  open,
  onOpenChange,
  meeting,
  initialStartTime,
  initialEndTime,
  members,
  teams = [],
  videoSettings,
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
  const [link, setLink] = useState("")
  const [videoProvider, setVideoProvider] = useState<"jaas" | "custom" | "none">("none")
  const [notes, setNotes] = useState("")
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [teamToAdd, setTeamToAdd] = useState<string | null>(null)
  const previewPassphrase = useMemo(() => generatePreviewPassphrase(), [])

  const selectedTeams = useMemo(
    () => teams.filter((team) => teamIds.includes(team.id)),
    [teams, teamIds]
  )

  const selectedDuration = getDurationMinutes(startTime, endTime)
  const startParts = splitDateTime(startTime)
  const startDate = new Date(startTime)
  const endDate = new Date(endTime)
  const hasValidTimeRange = !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate > startDate
  const previewSlug = slugifyRoomTitle(title)
  const previewRoomName = previewSlug === "meeting" ? previewPassphrase : `${previewSlug}-${getStablePreviewSuffix(meeting)}`
  const jaasLinkPreview = videoSettings?.enabled && videoSettings.appId
    ? `https://${videoSettings.domain || "8x8.vc"}/${encodeURIComponent(videoSettings.appId)}/${encodeURIComponent(previewRoomName)}`
    : ""

  const handleStartTimeChange = (nextStartTime: string) => {
    const duration = getDurationMinutes(startTime, endTime)
    setStartTime(nextStartTime)
    setEndTime(addMinutes(nextStartTime, duration))
  }

  const setDuration = (minutes: number) => {
    setEndTime(addMinutes(startTime, minutes))
  }

  useEffect(() => {
    if (!open) return
    setTitle(meeting?.title ?? "")
    setStartTime(toInputValue(defaultStart))
    setEndTime(toInputValue(defaultEnd))
    setLocation(meeting?.location ?? "")
    setLink(meeting?.link ?? "")
    setVideoProvider(
      meeting
        ? isGeneratedJaasLink(meeting) ? "jaas" : meeting.link ? "custom" : "none"
        : videoSettings?.enabled && videoSettings.defaultProvider ? "jaas" : "none"
    )
    setNotes(meeting?.notesMd ?? "")
    setAttendeeIds(meeting?.attendees?.map((attendee) => attendee.userId) ?? [])
    setTeamIds([])
    setTeamToAdd(null)
  }, [open, meeting, defaultStart, defaultEnd, videoSettings?.defaultProvider, videoSettings?.enabled])

  const addTeam = () => {
    if (!teamToAdd || teamIds.includes(teamToAdd)) {
      return
    }

    setTeamIds((prev) => [...prev, teamToAdd])
    setTeamToAdd(null)
  }

  const removeTeam = (teamId: string) => {
    setTeamIds((prev) => prev.filter((id) => id !== teamId))
  }

  const handleSubmit = async () => {
    if (!title.trim()) return

    await onSubmit({
      title: title.trim(),
      startTime,
      endTime,
      location: location.trim() || undefined,
      link: videoProvider === "custom" ? link.trim() || undefined : undefined,
      videoProvider,
      notesMd: notes || undefined,
      attendeeIds,
      teamIds: teamIds.length > 0 ? teamIds : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Meeting" : "Schedule Meeting"}</DialogTitle>
          <DialogDescription>
            Add the details, time, and attendees for this meeting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly sync"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <DateTimePicker id="meeting-start" label="Starts" value={startTime} onChange={handleStartTimeChange} />
              <DateTimePicker id="meeting-end" label="Ends" value={endTime} minDate={startParts.datePart} onChange={setEndTime} />
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                {durationOptions.map((option) => (
                  <Button
                    key={option.minutes}
                    type="button"
                    variant={selectedDuration === option.minutes ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setDuration(option.minutes)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {!hasValidTimeRange ? (
                <div className="text-xs text-destructive">End time must be after the start time.</div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-location">Location</Label>
            <Input
              id="meeting-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Conference Room A"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-video-provider">Video meeting</Label>
            <Select value={videoProvider} onValueChange={(value) => setVideoProvider(value as "jaas" | "custom" | "none")}>
              <SelectTrigger id="meeting-video-provider">
                <SelectValue placeholder="Select video option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jaas" disabled={!videoSettings?.enabled && videoProvider !== "jaas"}>
                  Generate JaaS link
                </SelectItem>
                <SelectItem value="custom">Paste external link</SelectItem>
                <SelectItem value="none">No video meeting</SelectItem>
              </SelectContent>
            </Select>
            {!videoSettings?.enabled ? (
              <div className="text-xs text-muted-foreground">
                Configure and enable JaaS in Developer Settings to generate JaaS links.
              </div>
            ) : null}
          </div>

          {videoProvider === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="meeting-link">External meeting link</Label>
              <Input
                id="meeting-link"
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://zoom.us/..."
              />
              <div className="text-xs text-muted-foreground">
                Use this only for a link you already have. To auto-generate a Tuesday JaaS link, choose Generate JaaS link.
              </div>
            </div>
          ) : null}

          {videoProvider === "jaas" ? (
            <div className="space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <div>Tuesday will generate this JaaS room link when the meeting is saved.</div>
              {jaasLinkPreview ? (
                <div className="break-all font-medium text-foreground">{jaasLinkPreview}</div>
              ) : null}
              {!title.trim() ? (
                <div className="text-xs">Add a title to use it as the room name. Until then, Tuesday previews a generated passphrase.</div>
              ) : !meeting ? (
                <div className="text-xs">The final suffix will be generated after saving.</div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Teams</Label>
            <div className="flex gap-2">
              <ItemCombobox
                items={teams}
                value={teamToAdd}
                onChange={setTeamToAdd}
                getItemId={(team) => team.id}
                getItemLabel={(team) => team.name}
                placeholder="Select a team"
                searchPlaceholder="Search teams..."
                emptyLabel="No teams found"
                className="flex-1"
                contentClassName="w-[360px]"
              />
              <Button type="button" variant="outline" onClick={addTeam} disabled={!teamToAdd}>
                Add Team
              </Button>
            </div>

            {selectedTeams.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedTeams.map((team) => (
                  <Badge key={team.id} variant="secondary" className="flex items-center gap-1 pr-1">
                    <span className="text-xs">{team.name}</span>
                    <button
                      type="button"
                      onClick={() => removeTeam(team.id)}
                      className="ml-1 rounded hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-notes">Notes</Label>
            <Textarea
              id="meeting-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Attendees</Label>
            <AttendeePicker members={members} selectedIds={attendeeIds} onChange={setAttendeeIds} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isEdit && onDelete && (
            <Button type="button" variant="destructive" onClick={onDelete} disabled={isSubmitting}>
              Delete Meeting
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !title.trim() || !hasValidTimeRange}>
            {isEdit ? "Save Changes" : "Create Meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
