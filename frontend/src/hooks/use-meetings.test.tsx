import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let list: (...args: any[]) => Promise<any> = async () => []
let get: (...args: any[]) => Promise<any> = async () => null
let create: (...args: any[]) => Promise<any> = async () => ({ id: "meeting-1" })
let update: (...args: any[]) => Promise<any> = async () => ({ id: "meeting-1" })
let remove: (...args: any[]) => Promise<any> = async () => true
let myMeetings: (...args: any[]) => Promise<any> = async () => []

mock.module("@/api/meetings", () => ({
  meetingsApi: {
    list: (projectId: string) => list(projectId),
    get: (meetingId: string) => get(meetingId),
    create: (projectId: string, data: any) => create(projectId, data),
    update: (meetingId: string, data: any) => update(meetingId, data),
    delete: (meetingId: string) => remove(meetingId),
    myMeetings: () => myMeetings(),
  },
}))

const { useMeetings, useMyMeetings } = await import("./use-meetings")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe("useMeetings", () => {
  beforeEach(() => {
    list = async () => []
    get = async () => null
    create = async () => ({ id: "meeting-1" })
    update = async () => ({ id: "meeting-1" })
    remove = async () => true
    myMeetings = async () => []
  })

  it("loads project meetings", async () => {
    list = async () => [{ id: "meeting-1" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useMeetings("project-1"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.meetings).toEqual([{ id: "meeting-1" }] as any)
  })

  it("loads my meetings", async () => {
    myMeetings = async () => [{ id: "meeting-2" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useMyMeetings(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([{ id: "meeting-2" }] as any)
  })
})
