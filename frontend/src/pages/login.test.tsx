import "@/test/setup"
import React from "react"
import { beforeEach, describe, expect, it, mock } from "bun:test"
import { useUIStore } from "@/store/ui-store"

let loginImpl = async (_data: { email: string; password: string }) => ({ id: "user-1" })
let passwordResetEnabled = true
const reactHookForm = await import("react-hook-form")

mock.module("react-hook-form", () => ({
  ...reactHookForm,
  useForm: () => ({
    register: () => ({}),
    handleSubmit:
      (callback: (data: { email: string; password: string }) => Promise<void>) =>
      async (event?: Event) => {
        event?.preventDefault?.()
        await callback({ email: "user@example.com", password: "password-123" })
      },
    formState: {
      errors: {},
      isSubmitting: false,
    },
  }),
}))

mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({
    login: {
      mutateAsync: (data: { email: string; password: string }) => loginImpl(data),
    },
  }),
}))

mock.module("@/hooks/use-setup", () => ({
  useSetup: () => ({
    passwordResetEnabled,
  }),
}))

const { fireEvent, render, waitFor } = await import("@testing-library/react")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { LoginPage } = await import("./login")

describe("LoginPage", () => {
  beforeEach(() => {
    loginImpl = async () => ({ id: "user-1" })
    passwordResetEnabled = true
    useUIStore.setState({ theme: "light" })
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
  })

  it("submits credentials and navigates to the original destination", async () => {
    let receivedLogin: { email: string; password: string } | null = null
    loginImpl = async (data) => {
      receivedLogin = data
      return { id: "user-1" }
    }

    const view = render(
      <MemoryRouter
        initialEntries={[{ pathname: "/login", state: { from: { pathname: "/projects" } } }]}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/projects" element={<div>Projects destination</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(view.getByText("Forgot password?")).toBeDefined()

    fireEvent.click(view.getByRole("button", { name: "Sign in" }))

    await waitFor(() => {
      expect(receivedLogin).toEqual({ email: "user@example.com", password: "password-123" })
    })

    await waitFor(() => {
      expect(view.getByText("Projects destination")).toBeDefined()
    })
  })
})
