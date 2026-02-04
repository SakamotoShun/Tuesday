import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { meetingsApi } from "@/api/meetings"
import type { CreateMeetingInput, UpdateMeetingInput } from "@/api/types"

export function useMeetings(projectId: string) {
  const queryClient = useQueryClient()

  const meetings = useQuery({
    queryKey: ["projects", projectId, "meetings"],
    queryFn: () => meetingsApi.list(projectId),
    enabled: !!projectId,
  })

  const createMeeting = useMutation({
    mutationFn: (data: CreateMeetingInput) => meetingsApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "meetings"],
      })
    },
  })

  const updateMeeting = useMutation({
    mutationFn: ({ meetingId, data }: { meetingId: string; data: UpdateMeetingInput }) =>
      meetingsApi.update(meetingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "meetings"],
      })
      queryClient.invalidateQueries({
        queryKey: ["meetings", "my"],
      })
    },
  })

  const deleteMeeting = useMutation({
    mutationFn: (meetingId: string) => meetingsApi.delete(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "meetings"],
      })
      queryClient.invalidateQueries({
        queryKey: ["meetings", "my"],
      })
    },
  })

  return {
    meetings: meetings.data ?? [],
    isLoading: meetings.isLoading,
    error: meetings.error,
    createMeeting,
    updateMeeting,
    deleteMeeting,
  }
}

export function useMeeting(meetingId: string) {
  return useQuery({
    queryKey: ["meetings", meetingId],
    queryFn: () => meetingsApi.get(meetingId),
    enabled: !!meetingId,
  })
}

export function useMyMeetings() {
  return useQuery({
    queryKey: ["meetings", "my"],
    queryFn: () => meetingsApi.myMeetings(),
  })
}
