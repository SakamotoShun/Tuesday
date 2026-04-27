import "@/test/setup"
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useAuthStore } from "@/store/auth-store"

const USER_FIXTURE = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  avatarUrl: null,
  role: "member",
  employmentType: "full_time",
  hourlyRate: null,
  isDisabled: false,
  onboardingCompletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const

let getCurrentUser: (...args: any[]) => Promise<any> = async () => null
let login: (...args: any[]) => Promise<any> = async () => null
let logout: (...args: any[]) => Promise<any> = async () => null
let register: (...args: any[]) => Promise<any> = async () => null

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

function jsonResponse(body: unknown, status = 200, requestId = "req-test") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  })
}

describe("useAuth", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: true })
    getCurrentUser = async () => null
    login = async () => null
    logout = async () => null
    register = async () => null

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const url = new URL(rawUrl, "http://localhost")
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")

      if (url.pathname === "/api/v1/auth/me" && method === "GET") {
        try {
          const user = await getCurrentUser()
          return jsonResponse({ data: { user } }, 200, "req-auth-me")
        } catch (error) {
          return jsonResponse(
            { error: { code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "unauthorized" } },
            401,
            "req-auth-me"
          )
        }
      }

      if (url.pathname === "/api/v1/auth/login" && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        const user = await login(body)
        return jsonResponse({ data: { user } }, 200, "req-auth-login")
      }

      if (url.pathname === "/api/v1/auth/logout" && method === "POST") {
        await logout()
        return jsonResponse({ data: {} }, 200, "req-auth-logout")
      }

      if (url.pathname === "/api/v1/auth/register" && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        const user = await register(body)
        return jsonResponse({ data: { user } }, 200, "req-auth-register")
      }

      throw new Error(`Unhandled fetch in use-auth.test.tsx: ${method} ${url.pathname}`)
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("loads current user", async () => {
    getCurrentUser = async () => USER_FIXTURE
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
    getCurrentUser = async () => USER_FIXTURE
    login = async () => USER_FIXTURE
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(() => result.current.login.mutateAsync({ email: "user@example.com", password: "pw" }))
    await waitFor(() => expect(useAuthStore.getState().user?.id).toBe("user-1"))
  })

  it("clears user on logout", async () => {
    useAuthStore.setState({ user: USER_FIXTURE as any, isLoading: false })
    logout = async () => null
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(() => result.current.logout.mutateAsync())
    await waitFor(() => expect(result.current.user).toBeNull())
  })
})
