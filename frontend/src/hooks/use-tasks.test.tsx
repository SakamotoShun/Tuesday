import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let list: (...args: any[]) => Promise<any> = async () => []
let create: (...args: any[]) => Promise<any> = async () => ({ id: "task-1" })
let update: (...args: any[]) => Promise<any> = async () => ({ id: "task-1" })
let updateStatus: (...args: any[]) => Promise<any> = async () => ({ id: "task-1" })
let updateOrder: (...args: any[]) => Promise<any> = async () => ({ id: "task-1" })
let updateAssignees: (...args: any[]) => Promise<any> = async () => ({ id: "task-1" })
let remove: (...args: any[]) => Promise<any> = async () => null
let listStatuses: (...args: any[]) => Promise<any> = async () => []
let myTasks: (...args: any[]) => Promise<any> = async () => []
let get: (...args: any[]) => Promise<any> = async () => null

mock.module("@/api/tasks", () => ({
  tasksApi: {
    list: (projectId: string) => list(projectId),
    create: (projectId: string, data: any) => create(projectId, data),
    update: (taskId: string, data: any) => update(taskId, data),
    updateStatus: (taskId: string, data: any) => updateStatus(taskId, data),
    updateOrder: (taskId: string, data: any) => updateOrder(taskId, data),
    updateAssignees: (taskId: string, data: any) => updateAssignees(taskId, data),
    delete: (taskId: string) => remove(taskId),
    listStatuses: () => listStatuses(),
    myTasks: () => myTasks(),
    get: (taskId: string) => get(taskId),
  },
}))

const { useTasks, useTaskStatuses, useMyTasks } = await import("./use-tasks")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe("useTasks", () => {
  beforeEach(() => {
    list = async () => []
    create = async () => ({ id: "task-1" })
    update = async () => ({ id: "task-1" })
    updateStatus = async () => ({ id: "task-1" })
    updateOrder = async () => ({ id: "task-1" })
    updateAssignees = async () => ({ id: "task-1" })
    remove = async () => null
    listStatuses = async () => []
    myTasks = async () => []
    get = async () => null
  })

  it("loads project tasks", async () => {
    list = async () => [{ id: "task-1" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useTasks("project-1"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tasks).toEqual([{ id: "task-1" }] as any)
  })

  it("updates task status", async () => {
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useTasks("project-1"), { wrapper })
    await result.current.updateTaskStatus.mutateAsync({ taskId: "task-1", data: { statusId: "status-1" } })
    await waitFor(() => expect(result.current.updateTaskStatus.isSuccess).toBe(true))
  })

  it("loads task statuses", async () => {
    listStatuses = async () => [{ id: "status-1" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useTaskStatuses(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([{ id: "status-1" }] as any)
  })

  it("loads my tasks", async () => {
    myTasks = async () => [{ id: "task-2" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useMyTasks(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([{ id: "task-2" }] as any)
  })
})
