import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventClickArg, EventContentArg } from "@fullcalendar/core"
import type { DateClickArg } from "@fullcalendar/interaction"
import type { Meeting } from "@/api/types"

interface CalendarViewProps {
  meetings: Meeting[]
  onSelectDate: (date: Date, allDay: boolean) => void
  onSelectMeeting: (meeting: Meeting) => void
  showProject?: boolean
}

export function CalendarView({
  meetings,
  onSelectDate,
  onSelectMeeting,
  showProject,
}: CalendarViewProps) {
  const meetingMap = new Map(meetings.map((meeting) => [meeting.id, meeting]))

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={meetings.map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          start: meeting.startTime,
          end: meeting.endTime,
          extendedProps: {
            projectName: meeting.project?.name,
          },
        }))}
        eventClick={(info: EventClickArg) => {
          const meeting = meetingMap.get(info.event.id)
          if (meeting) {
            onSelectMeeting(meeting)
          }
        }}
        dateClick={(info: DateClickArg) => onSelectDate(info.date, info.allDay)}
        height="auto"
        eventContent={(arg: EventContentArg) => {
          const title = document.createElement("div")
          title.className = "fc-event-title"
          title.textContent = arg.event.title

          if (!showProject || !arg.event.extendedProps.projectName) {
            return { domNodes: [title] }
          }

          const project = document.createElement("div")
          project.className = "fc-event-project"
          project.textContent = String(arg.event.extendedProps.projectName)
          return { domNodes: [title, project] }
        }}
      />
    </div>
  )
}
