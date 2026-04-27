import "@/test/setup"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { useAuthStore } from "@/store/auth-store"
import { useUIStore } from "@/store/ui-store"

const LOGIN_FIXTURE = { email: "user@example.com", password: "password-123" } as const
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

let loginImpl = async (_data: { email: string; password: string }) => ({ id: "user-1" })
let passwordResetEnabled = true
let currentUserImpl: () => Promise<typeof USER_FIXTURE> = async () => {
  throw new Error("unauthorized")
}
let submitLogin: (() => Promise<void>) | null = null

const reactHookForm = await import("react-hook-form")

mock.module("react-hook-form", () => ({
  ...reactHookForm,
  useForm: () => ({
    register: () => ({}),
    handleSubmit: (callback: (data: { email: string; password: string }) => Promise<void>) => {
      submitLogin = () => callback(LOGIN_FIXTURE)
      return (event?: Event) => {
        event?.preventDefault?.()
        return submitLogin?.()
      }
    },
    formState: {
      errors: {},
      isSubmitting: false,
    },
  }),
}))

const { LoginPage } = await import("./login")

function createWrapper(options?: {
  setupStatus?: { initialized: boolean; passwordResetEnabled: boolean }
  authUser?: typeof USER_FIXTURE | null
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  })

  queryClient.setQueryData(["setup", "status"], options?.setupStatus ?? {
    initialized: false,
    passwordResetEnabled: true,
  })
  queryClient.setQueryData(["auth", "me"], options?.authUser ?? null)

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

describe("LoginPage", () => {
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn
  const originalFetch = globalThis.fetch
  let originalMatchMedia: typeof window.matchMedia
  let originalUIState = useUIStore.getState()
  let originalAuthState = useAuthStore.getState()

  beforeEach(() => {
    console.error = originalConsoleError
    console.warn = (...args: unknown[]) => {
      const [firstArg] = args
      if (typeof firstArg === "string" && firstArg.includes("not wrapped in act")) {
        return
      }

      originalConsoleWarn(...args)
    }
    originalMatchMedia = window.matchMedia
    originalUIState = useUIStore.getState()
    originalAuthState = useAuthStore.getState()
    currentUserImpl = async () => {
      throw new Error("unauthorized")
    }
    loginImpl = async () => USER_FIXTURE
    passwordResetEnabled = true
    submitLogin = null
    useUIStore.setState({ theme: "light" })
    useAuthStore.setState({ user: null, isLoading: true })
    window.matchMedia = (() => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const url = new URL(rawUrl, "http://localhost")
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")

      if (url.pathname === "/api/v1/setup/status" && method === "GET") {
        return jsonResponse({ data: { initialized: false, passwordResetEnabled } }, 200, "req-setup-status")
      }

      if (url.pathname === "/api/v1/auth/me" && method === "GET") {
        try {
          const user = await currentUserImpl()
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
        try {
          const user = await loginImpl(body)
          return jsonResponse({ data: { user } }, 200, "req-auth-login")
        } catch (error) {
          return jsonResponse(
            { error: { code: "INVALID_CREDENTIALS", message: error instanceof Error ? error.message : "invalid" } },
            401,
            "req-auth-login"
          )
        }
      }

      throw new Error(`Unhandled fetch in login.test.tsx: ${method} ${url.pathname}`)
    }) as typeof globalThis.fetch
  })

  afterEach(async () => {
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
    globalThis.fetch = originalFetch
    window.matchMedia = originalMatchMedia
    await act(async () => {
      useUIStore.setState(originalUIState, true)
      useAuthStore.setState(originalAuthState, true)
    })
  })

  it("submits credentials and navigates to the original destination", async () => {
    let receivedLogin: { email: string; password: string } | null = null
    const { wrapper } = createWrapper({
      setupStatus: { initialized: false, passwordResetEnabled: true },
      authUser: null,
    })

    currentUserImpl = async () => USER_FIXTURE
    loginImpl = async (data) => {
      receivedLogin = data
      return USER_FIXTURE
    }

    const view = render(
      <MemoryRouter
        initialEntries={[{ pathname: "/login", state: { from: { pathname: "/projects" } } }]}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/projects" element={<div>Projects destination</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper }
    )

    await waitFor(() => {
      expect(view.getByText("Forgot password?")).toBeDefined()
    })

    await act(async () => {
      await submitLogin?.()
    })

    await waitFor(() => {
      expect(receivedLogin).toEqual(LOGIN_FIXTURE)
    })

    await waitFor(() => {
      expect(view.getByText("Projects destination")).toBeDefined()
    })
  })

  it("hides forgot password when disabled", () => {
    passwordResetEnabled = false
    const { wrapper } = createWrapper({
      setupStatus: { initialized: false, passwordResetEnabled: false },
      authUser: null,
    })

    const view = render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
      { wrapper }
    )

    expect(view.queryByText("Forgot password?")).toBeNull()
  })

  it("does not navigate when login fails", async () => {
    const { wrapper } = createWrapper({
      setupStatus: { initialized: false, passwordResetEnabled: true },
      authUser: null,
    })

    loginImpl = async () => {
      throw new Error("invalid")
    }

    const view = render(
      <MemoryRouter
        initialEntries={[{ pathname: "/login", state: { from: { pathname: "/projects" } } }]}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/projects" element={<div>Projects destination</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper }
    )

    await waitFor(() => {
      expect(view.getByText("Forgot password?")).toBeDefined()
    })

    await act(async () => {
      await submitLogin?.()
    })

    await waitFor(() => {
      expect(view.getByText("invalid")).toBeDefined()
    })

    expect(view.queryByText("Projects destination")).toBeNull()
  })
})
