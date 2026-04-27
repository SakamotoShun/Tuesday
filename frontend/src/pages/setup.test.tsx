import "@/test/setup"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

const SETUP_FIXTURE = {
  workspaceName: "Acme Corp",
  adminEmail: "admin@example.com",
  adminName: "Jane Admin",
  adminPassword: "password-123",
} as const

const SETUP_FORM_FIXTURE = {
  ...SETUP_FIXTURE,
  confirmPassword: "password-123",
} as const

let completeImpl = async (_data: {
  workspaceName: string
  adminEmail: string
  adminName: string
  adminPassword: string
}) => undefined

const reactHookForm = await import("react-hook-form")

mock.module("react-hook-form", () => ({
  ...reactHookForm,
  useForm: () => ({
    register: () => ({}),
    handleSubmit:
      (callback: (data: {
        workspaceName: string
        adminEmail: string
        adminName: string
        adminPassword: string
        confirmPassword: string
      }) => Promise<void>) =>
      async (event?: Event) => {
        event?.preventDefault?.()
        await callback(SETUP_FORM_FIXTURE)
      },
    formState: {
      errors: {},
      isSubmitting: false,
    },
  }),
}))

const { SetupPage } = await import("./setup")

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

describe("SetupPage", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    completeImpl = async () => undefined

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const url = new URL(rawUrl, "http://localhost")
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")

      if (url.pathname === "/api/v1/setup/status" && method === "GET") {
        return jsonResponse({ data: { initialized: false, passwordResetEnabled: true } }, 200, "req-setup-status")
      }

      if (url.pathname === "/api/v1/setup/complete" && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        try {
          await completeImpl(body)
          return jsonResponse({ data: { message: "ok" } }, 200, "req-setup-complete")
        } catch (error) {
          return jsonResponse(
            { error: { code: "SETUP_FAILED", message: error instanceof Error ? error.message : "boom" } },
            400,
            "req-setup-complete"
          )
        }
      }

      throw new Error(`Unhandled fetch in setup.test.tsx: ${method} ${url.pathname}`)
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("submits setup details and navigates to login", async () => {
    const { wrapper } = createWrapper()
    let receivedPayload: {
      workspaceName: string
      adminEmail: string
      adminName: string
      adminPassword: string
    } | null = null

    completeImpl = async (data) => {
      receivedPayload = data
    }

    const view = render(
      <MemoryRouter initialEntries={["/setup"]}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper }
    )

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Complete Setup" }))
    })

    await waitFor(() => {
      expect(receivedPayload).toEqual(SETUP_FIXTURE)
    })

    await waitFor(() => {
      expect(view.getByText("Login destination")).toBeDefined()
    })
  })

  it("surfaces errors when complete fails", async () => {
    const { wrapper } = createWrapper()

    completeImpl = async () => {
      throw new Error("boom")
    }

    const view = render(
      <MemoryRouter initialEntries={["/setup"]}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper }
    )

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Complete Setup" }))
    })

    await waitFor(() => {
      expect(view.getByText("boom")).toBeDefined()
    })

    expect(view.queryByText("Login destination")).toBeNull()
    expect(view.getByRole("button", { name: "Complete Setup" })).toBeDefined()
  })
})
