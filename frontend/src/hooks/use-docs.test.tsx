import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"

let list: (...args: any[]) => Promise<any> = async () => []
let get: (...args: any[]) => Promise<any> = async () => null
let getWithChildren: (...args: any[]) => Promise<any> = async () => null
let listPersonal: (...args: any[]) => Promise<any> = async () => []
let create: (...args: any[]) => Promise<any> = async () => ({ id: "doc-1" })
let update: (...args: any[]) => Promise<any> = async () => ({ id: "doc-1" })
let remove: (...args: any[]) => Promise<any> = async () => true

mock.module("@/api/docs", () => ({
  docsApi: {
    list: (projectId: string) => list(projectId),
    get: (docId: string) => get(docId),
    getWithChildren: (docId: string) => getWithChildren(docId),
    listPersonal: () => listPersonal(),
    create: (projectId: string, data: any) => create(projectId, data),
    update: (docId: string, data: any) => update(docId, data),
    remove: (docId: string) => remove(docId),
  },
}))

const { useDocs, usePersonalDocs } = await import("./use-docs")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe("useDocs", () => {
  beforeEach(() => {
    list = async () => []
    get = async () => null
    getWithChildren = async () => null
    listPersonal = async () => []
    create = async () => ({ id: "doc-1" })
    update = async () => ({ id: "doc-1" })
    remove = async () => true
  })

  it("loads project docs", async () => {
    list = async () => [{ id: "doc-1" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useDocs("project-1"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.docs).toEqual([{ id: "doc-1" }] as any)
  })

  it("loads personal docs", async () => {
    listPersonal = async () => [{ id: "doc-2" }]
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => usePersonalDocs(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([{ id: "doc-2" }] as any)
  })
})
