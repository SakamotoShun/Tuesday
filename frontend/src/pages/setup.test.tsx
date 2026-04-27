import "@/test/setup"
import React from "react"
import { beforeEach, describe, expect, it, mock } from "bun:test"

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
        await callback({
          workspaceName: "Acme Corp",
          adminEmail: "admin@example.com",
          adminName: "Jane Admin",
          adminPassword: "password-123",
          confirmPassword: "password-123",
        })
      },
    formState: {
      errors: {},
      isSubmitting: false,
    },
  }),
}))

mock.module("@/hooks/use-setup", () => ({
  useSetup: () => ({
    complete: {
      mutateAsync: (data: {
        workspaceName: string
        adminEmail: string
        adminName: string
        adminPassword: string
      }) => completeImpl(data),
    },
  }),
}))

const { fireEvent, render, waitFor } = await import("@testing-library/react")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { SetupPage } = await import("./setup")

describe("SetupPage", () => {
  beforeEach(() => {
    completeImpl = async () => undefined
  })

  it("submits setup details and navigates to login", async () => {
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
      </MemoryRouter>
    )

    fireEvent.click(view.getByRole("button", { name: "Complete Setup" }))

    await waitFor(() => {
      expect(receivedPayload).toEqual({
        workspaceName: "Acme Corp",
        adminEmail: "admin@example.com",
        adminName: "Jane Admin",
        adminPassword: "password-123",
      })
    })

    await waitFor(() => {
      expect(view.getByText("Login destination")).toBeDefined()
    })
  })
})
