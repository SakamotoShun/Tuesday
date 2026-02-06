import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let listProjects: (...args: any[]) => Promise<any> = async () => []
let listStatuses: (...args: any[]) => Promise<any> = async () => []
let createProject: (...args: any[]) => Promise<any> = async () => ({ id: "project-1" })
let updateProject: (...args: any[]) => Promise<any> = async () => ({ id: "project-1" })
let removeProject: (...args: any[]) => Promise<any> = async () => null
let getTeams: (...args: any[]) => Promise<any> = async () => []

let assignProject: (...args: any[]) => Promise<any> = async () => null
let unassignProject: (...args: any[]) => Promise<any> = async () => null

mock.module("@/api/projects", () => ({
  list: () => listProjects(),
  listStatuses: () => listStatuses(),
  create: (data: any) => createProject(data),
  update: (id: string, data: any) => updateProject(id, data),
  remove: (id: string) => removeProject(id),
  getTeams: (projectId: string) => getTeams(projectId),
  get: (id: string) => Promise.resolve({ id }),
}))

mock.module("@/api/teams", () => ({
  assignProject: (teamId: string, projectId: string) => assignProject(teamId, projectId),
  unassignProject: (teamId: string, projectId: string) => unassignProject(teamId, projectId),
}))

const { useProjects, useProjectStatuses, useProjectTeams } = await import("./use-projects")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe("useProjects", () => {
  beforeEach(() => {
    listProjects = async () => []
    listStatuses = async () => []
    createProject = async () => ({ id: "project-1" })
    updateProject = async () => ({ id: "project-1" })
    removeProject = async () => null
    getTeams = async () => []
    assignProject = async () => null
    unassignProject = async () => null
  })

  it("loads project list", async () => {
    listProjects = async () => [{ id: "project-1" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useProjects(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.projects).toEqual([{ id: "project-1" }] as any)
  })

  it("loads project statuses", async () => {
    listStatuses = async () => [{ id: "status-1" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useProjectStatuses(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([{ id: "status-1" }] as any)
  })

  it("assigns and unassigns teams", async () => {
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useProjectTeams("project-1"), { wrapper })

    await result.current.assignTeam.mutateAsync("team-1")
    await waitFor(() => expect(result.current.assignTeam.isSuccess).toBe(true))

    await result.current.unassignTeam.mutateAsync("team-1")
    await waitFor(() => expect(result.current.unassignTeam.isSuccess).toBe(true))
  })
})
