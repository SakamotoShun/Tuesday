import { api } from "./client"
import type {
  InterviewStage,
  JobPosition,
  Candidate,
  JobApplication,
  Interview,
  InterviewNote,
  PositionDoc,
  CreateJobPositionInput,
  UpdateJobPositionInput,
  CreatePositionDocInput,
  CreateCandidateInput,
  UpdateCandidateInput,
  CreateJobApplicationInput,
  MoveApplicationInput,
  CreateInterviewInput,
  UpdateInterviewInput,
  CreateInterviewNoteInput,
  UpdateInterviewNoteInput,
} from "./types"

// Interview Stages
export const hiringApi = {
  // Stages
  listStages: (): Promise<InterviewStage[]> =>
    api.get<InterviewStage[]>("/hiring/stages"),

  createStage: (data: { name: string; color?: string; sortOrder?: number }): Promise<InterviewStage> =>
    api.post<InterviewStage>("/hiring/stages", data),

  updateStage: (id: string, data: { name?: string; color?: string }): Promise<InterviewStage> =>
    api.patch<InterviewStage>(`/hiring/stages/${id}`, data),

  deleteStage: (id: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/hiring/stages/${id}`),

  reorderStages: (ids: string[]): Promise<{ reordered: boolean }> =>
    api.post<{ reordered: boolean }>("/hiring/stages/reorder", { ids }),

  // Job Positions
  listPositions: (filters?: { status?: string; search?: string }): Promise<JobPosition[]> => {
    const params = new URLSearchParams()
    if (filters?.status) params.set("status", filters.status)
    if (filters?.search) params.set("search", filters.search)
    const qs = params.toString()
    return api.get<JobPosition[]>(`/hiring/positions${qs ? `?${qs}` : ""}`)
  },

  getPosition: (id: string): Promise<JobPosition> =>
    api.get<JobPosition>(`/hiring/positions/${id}`),

  createPosition: (data: CreateJobPositionInput): Promise<JobPosition> =>
    api.post<JobPosition>("/hiring/positions", data),

  updatePosition: (id: string, data: UpdateJobPositionInput): Promise<JobPosition> =>
    api.patch<JobPosition>(`/hiring/positions/${id}`, data),

  deletePosition: (id: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/hiring/positions/${id}`),

  listDocs: (): Promise<PositionDoc[]> =>
    api.get<PositionDoc[]>("/hiring/docs"),

  listPositionDocs: (positionId: string): Promise<PositionDoc[]> =>
    api.get<PositionDoc[]>(`/hiring/positions/${positionId}/docs`),

  createPositionDoc: (positionId: string, data: CreatePositionDocInput): Promise<PositionDoc> =>
    api.post<PositionDoc>(`/hiring/positions/${positionId}/docs`, data),

  deletePositionDoc: (positionId: string, positionDocId: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/hiring/positions/${positionId}/docs/${positionDocId}`),

  // Candidates
  listCandidates: (filters?: { search?: string }): Promise<Candidate[]> => {
    const params = new URLSearchParams()
    if (filters?.search) params.set("search", filters.search)
    const qs = params.toString()
    return api.get<Candidate[]>(`/hiring/candidates${qs ? `?${qs}` : ""}`)
  },

  getCandidate: (id: string): Promise<Candidate> =>
    api.get<Candidate>(`/hiring/candidates/${id}`),

  createCandidate: (data: CreateCandidateInput): Promise<Candidate> =>
    api.post<Candidate>("/hiring/candidates", data),

  updateCandidate: (id: string, data: UpdateCandidateInput): Promise<Candidate> =>
    api.patch<Candidate>(`/hiring/candidates/${id}`, data),

  deleteCandidate: (id: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/hiring/candidates/${id}`),

  // Job Applications
  listApplications: (positionId: string): Promise<JobApplication[]> =>
    api.get<JobApplication[]>(`/hiring/positions/${positionId}/applications`),

  getApplication: (id: string): Promise<JobApplication> =>
    api.get<JobApplication>(`/hiring/applications/${id}`),

  createApplication: (data: CreateJobApplicationInput): Promise<JobApplication> =>
    api.post<JobApplication>("/hiring/applications", data),

  moveApplication: (id: string, data: MoveApplicationInput): Promise<JobApplication> =>
    api.patch<JobApplication>(`/hiring/applications/${id}/move`, data),

  deleteApplication: (id: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/hiring/applications/${id}`),

  // Interviews
  listInterviews: (applicationId: string): Promise<Interview[]> =>
    api.get<Interview[]>(`/hiring/applications/${applicationId}/interviews`),

  getInterview: (id: string): Promise<Interview> =>
    api.get<Interview>(`/hiring/interviews/${id}`),

  createInterview: (data: CreateInterviewInput): Promise<Interview> =>
    api.post<Interview>("/hiring/interviews", data),

  updateInterview: (id: string, data: UpdateInterviewInput): Promise<Interview> =>
    api.patch<Interview>(`/hiring/interviews/${id}`, data),

  deleteInterview: (id: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/hiring/interviews/${id}`),

  // Interview Notes
  listNotes: (applicationId: string): Promise<InterviewNote[]> =>
    api.get<InterviewNote[]>(`/hiring/applications/${applicationId}/notes`),

  getNote: (id: string): Promise<InterviewNote> =>
    api.get<InterviewNote>(`/hiring/notes/${id}`),

  createNote: (data: CreateInterviewNoteInput): Promise<InterviewNote> =>
    api.post<InterviewNote>("/hiring/notes", data),

  updateNote: (id: string, data: UpdateInterviewNoteInput): Promise<InterviewNote> =>
    api.patch<InterviewNote>(`/hiring/notes/${id}`, data),

  deleteNote: (id: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/hiring/notes/${id}`),
}
