import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { hiringApi } from "@/api/hiring"
import type {
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
} from "@/api/types"

// Interview Stages
export function useInterviewStages() {
  return useQuery({
    queryKey: ["interview-stages"],
    queryFn: () => hiringApi.listStages(),
  })
}

export function useInterviewStageMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["interview-stages"] })

  const createStage = useMutation({
    mutationFn: (data: { name: string; color?: string; sortOrder?: number }) =>
      hiringApi.createStage(data),
    onSuccess: invalidate,
  })

  const updateStage = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      hiringApi.updateStage(id, data),
    onSuccess: invalidate,
  })

  const deleteStage = useMutation({
    mutationFn: (id: string) => hiringApi.deleteStage(id),
    onSuccess: invalidate,
  })

  const reorderStages = useMutation({
    mutationFn: (ids: string[]) => hiringApi.reorderStages(ids),
    onSuccess: invalidate,
  })

  return { createStage, updateStage, deleteStage, reorderStages }
}

// Job Positions
export function useJobPositions(filters?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ["job-positions", filters],
    queryFn: () => hiringApi.listPositions(filters),
  })
}

export function useJobPosition(id: string) {
  return useQuery({
    queryKey: ["job-positions", id],
    queryFn: () => hiringApi.getPosition(id),
    enabled: !!id,
  })
}

export function useJobPositionMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["job-positions"] })

  const createPosition = useMutation({
    mutationFn: (data: CreateJobPositionInput) => hiringApi.createPosition(data),
    onSuccess: invalidate,
  })

  const updatePosition = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateJobPositionInput }) =>
      hiringApi.updatePosition(id, data),
    onSuccess: invalidate,
  })

  const deletePosition = useMutation({
    mutationFn: (id: string) => hiringApi.deletePosition(id),
    onSuccess: invalidate,
  })

  return { createPosition, updatePosition, deletePosition }
}

export function usePositionDocs(positionId: string) {
  return useQuery({
    queryKey: ["position-docs", positionId],
    queryFn: () => hiringApi.listPositionDocs(positionId),
    enabled: !!positionId,
  })
}

export function useHiringDocs() {
  return useQuery({
    queryKey: ["hiring-docs"],
    queryFn: () => hiringApi.listDocs(),
  })
}

export function usePositionDocMutations(positionId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["position-docs", positionId] })
    queryClient.invalidateQueries({ queryKey: ["hiring-docs"] })
    queryClient.invalidateQueries({ queryKey: ["job-positions", positionId] })
  }

  const createPositionDoc = useMutation({
    mutationFn: (data: CreatePositionDocInput) => hiringApi.createPositionDoc(positionId, data),
    onSuccess: invalidate,
  })

  const deletePositionDoc = useMutation({
    mutationFn: (positionDocId: string) => hiringApi.deletePositionDoc(positionId, positionDocId),
    onSuccess: invalidate,
  })

  return { createPositionDoc, deletePositionDoc }
}

// Candidates
export function useCandidates(filters?: { search?: string }) {
  return useQuery({
    queryKey: ["candidates", filters],
    queryFn: () => hiringApi.listCandidates(filters),
  })
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: ["candidates", id],
    queryFn: () => hiringApi.getCandidate(id),
    enabled: !!id,
  })
}

export function useCandidateMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["candidates"] })

  const createCandidate = useMutation({
    mutationFn: (data: CreateCandidateInput) => hiringApi.createCandidate(data),
    onSuccess: invalidate,
  })

  const updateCandidate = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCandidateInput }) =>
      hiringApi.updateCandidate(id, data),
    onSuccess: invalidate,
  })

  const deleteCandidate = useMutation({
    mutationFn: (id: string) => hiringApi.deleteCandidate(id),
    onSuccess: invalidate,
  })

  return { createCandidate, updateCandidate, deleteCandidate }
}

// Job Applications
export function useApplications(positionId: string) {
  return useQuery({
    queryKey: ["applications", positionId],
    queryFn: () => hiringApi.listApplications(positionId),
    enabled: !!positionId,
  })
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ["applications", "detail", id],
    queryFn: () => hiringApi.getApplication(id),
    enabled: !!id,
  })
}

export function useApplicationMutations(positionId?: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    if (positionId) {
      queryClient.invalidateQueries({ queryKey: ["applications", positionId] })
    }
    queryClient.invalidateQueries({ queryKey: ["applications"] })
    queryClient.invalidateQueries({ queryKey: ["applications", "detail"] })
    queryClient.invalidateQueries({ queryKey: ["candidates"] })
  }

  const createApplication = useMutation({
    mutationFn: (data: CreateJobApplicationInput) => hiringApi.createApplication(data),
    onSuccess: invalidate,
  })

  const moveApplication = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MoveApplicationInput }) =>
      hiringApi.moveApplication(id, data),
    onSuccess: invalidate,
  })

  const deleteApplication = useMutation({
    mutationFn: (id: string) => hiringApi.deleteApplication(id),
    onSuccess: invalidate,
  })

  return { createApplication, moveApplication, deleteApplication }
}

// Interviews
export function useInterviews(applicationId: string) {
  return useQuery({
    queryKey: ["interviews", applicationId],
    queryFn: () => hiringApi.listInterviews(applicationId),
    enabled: !!applicationId,
  })
}

export function useInterviewMutations(applicationId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["interviews", applicationId] })
    queryClient.invalidateQueries({ queryKey: ["applications"] })
  }

  const createInterview = useMutation({
    mutationFn: (data: CreateInterviewInput) => hiringApi.createInterview(data),
    onSuccess: invalidate,
  })

  const updateInterview = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInterviewInput }) =>
      hiringApi.updateInterview(id, data),
    onSuccess: invalidate,
  })

  const deleteInterview = useMutation({
    mutationFn: (id: string) => hiringApi.deleteInterview(id),
    onSuccess: invalidate,
  })

  return { createInterview, updateInterview, deleteInterview }
}

// Interview Notes
export function useInterviewNotes(applicationId: string) {
  return useQuery({
    queryKey: ["interview-notes", applicationId],
    queryFn: () => hiringApi.listNotes(applicationId),
    enabled: !!applicationId,
  })
}

export function useInterviewNoteMutations(applicationId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["interview-notes", applicationId] })
    queryClient.invalidateQueries({ queryKey: ["applications"] })
  }

  const createNote = useMutation({
    mutationFn: (data: CreateInterviewNoteInput) => hiringApi.createNote(data),
    onSuccess: invalidate,
  })

  const updateNote = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInterviewNoteInput }) =>
      hiringApi.updateNote(id, data),
    onSuccess: invalidate,
  })

  const deleteNote = useMutation({
    mutationFn: (id: string) => hiringApi.deleteNote(id),
    onSuccess: invalidate,
  })

  return { createNote, updateNote, deleteNote }
}
