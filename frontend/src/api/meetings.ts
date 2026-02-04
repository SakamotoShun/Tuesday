import { api } from "./client"
import type {
  Meeting,
  CreateMeetingInput,
  UpdateMeetingInput,
  MeetingAttendee,
  User,
  Project,
} from "./types"

type BackendMeeting = Meeting & {
  createdBy?: User | string
  attendees?: Array<MeetingAttendee & { user?: User }>
  project?: Project
}

const normalizeMeeting = (meeting: BackendMeeting): Meeting => {
  const createdByUser = meeting.createdBy && typeof meeting.createdBy === "object"
    ? (meeting.createdBy as User)
    : undefined
  const createdById = typeof meeting.createdBy === "string"
    ? meeting.createdBy
    : createdByUser?.id ?? meeting.createdBy

  return {
    ...meeting,
    createdBy: createdById as string,
    createdByUser,
  }
}

const normalizeMeetings = (meetings: BackendMeeting[]) => meetings.map(normalizeMeeting)

export const meetingsApi = {
  list: async (projectId: string): Promise<Meeting[]> => {
    const meetings = await api.get<BackendMeeting[]>(`/meetings/projects/${projectId}/meetings`)
    return normalizeMeetings(meetings)
  },

  myMeetings: async (): Promise<Meeting[]> => {
    const meetings = await api.get<BackendMeeting[]>("/meetings/my")
    return normalizeMeetings(meetings)
  },

  get: async (meetingId: string): Promise<Meeting> => {
    const meeting = await api.get<BackendMeeting>(`/meetings/${meetingId}`)
    return normalizeMeeting(meeting)
  },

  create: async (projectId: string, input: CreateMeetingInput): Promise<Meeting> => {
    const meeting = await api.post<BackendMeeting>(`/meetings/projects/${projectId}/meetings`, input)
    return normalizeMeeting(meeting)
  },

  update: async (meetingId: string, input: UpdateMeetingInput): Promise<Meeting> => {
    const meeting = await api.patch<BackendMeeting>(`/meetings/${meetingId}`, input)
    return normalizeMeeting(meeting)
  },

  delete: (meetingId: string): Promise<void> => {
    return api.delete<void>(`/meetings/${meetingId}`)
  },
}
