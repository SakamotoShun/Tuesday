import "@/test/setup"
import React from "react"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { useAuthStore } from "@/store/auth-store"

let getCurrentUser: (...args: any[]) => Promise<any> = async () => null
let login: (...args: any[]) => Promise<any> = async () => null
let logout: (...args: any[]) => Promise<any> = async () => null
let register: (...args: any[]) => Promise<any> = async () => null

mock.module("@/api/auth", () => ({
  getCurrentUser: () => getCurrentUser(),
  login: (data: any) => login(data),
  logout: () => logout(),
  register: (data: any) => register(data),
}))

const { useAuth } = await import("./use-auth")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe("useAuth", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: true })
    getCurrentUser = async () => null
    login = async () => null
    logout = async () => null
    register = async () => null
  })

  it("loads current user", async () => {
    getCurrentUser = async () => ({ id: "user-1", email: "user@example.com" })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user?.id).toBe("user-1")
    expect(result.current.isAuthenticated).toBe(true)
  })

  it("handles missing user", async () => {
    getCurrentUser = async () => {
      throw new Error("unauthorized")
    }
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it("sets user on login", async () => {
    getCurrentUser = async () => ({ id: "user-1", email: "user@example.com" })
    login = async () => ({ id: "user-1", email: "user@example.com" })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuth(), { wrapper })

    await result.current.login.mutateAsync({ email: "user@example.com", password: "pw" })
    await waitFor(() => expect(useAuthStore.getState().user?.id).toBe("user-1"))
  })

  it("clears user on logout", async () => {
    useAuthStore.setState({ user: { id: "user-1", email: "user@example.com" } as any, isLoading: false })
    logout = async () => null
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuth(), { wrapper })

    await result.current.logout.mutateAsync()
    await waitFor(() => expect(result.current.user).toBeNull())
  })
})
