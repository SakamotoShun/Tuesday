import "@/test/setup"
import { afterAll, afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ApiErrorResponse } from "@/api/client"
import { mcpTokensApi } from "@/api/mcp-tokens"
import type { McpTokenListItem } from "@/api/types"
import { McpTokenSection } from "./mcp-token-section"

const list = spyOn(mcpTokensApi, "list")
const revoke = spyOn(mcpTokensApi, "revoke")
const clients: QueryClient[] = []
let serverTokens: McpTokenListItem[]

function token(overrides: Partial<McpTokenListItem> = {}): McpTokenListItem {
  return {
    id: "token-desktop",
    name: "Claude Desktop",
    scopes: ["projects:read"],
    createdAt: "2026-09-01T00:00:00.000Z",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  }
}

function revokeOnServer(id: string) {
  serverTokens = serverTokens.map((item) => item.id === id
    ? { ...item, revokedAt: "2026-09-25T12:00:00.000Z" }
    : item)
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
  clients.push(queryClient)
  const view = render(
    <QueryClientProvider client={queryClient}>
      <McpTokenSection />
    </QueryClientProvider>
  )
  return { ...view, queryClient }
}

async function openDelete(view: ReturnType<typeof renderSection>) {
  fireEvent.click(await view.findByRole("button", { name: "Delete token Claude Desktop" }))
  return within(view.getByRole("dialog", { name: "Delete token" }))
}

beforeEach(() => {
  serverTokens = [
    token(),
    token({ id: "token-other", name: "Other client" }),
    token({ id: "token-old", name: "Old client", revokedAt: "2026-09-10T00:00:00.000Z" }),
  ]
  list.mockReset().mockImplementation(async () => structuredClone(serverTokens))
  revoke.mockReset().mockImplementation(async (id) => revokeOnServer(id))
})

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
})

afterAll(() => {
  list.mockRestore()
  revoke.mockRestore()
})

describe("McpTokenSection deletion", () => {
  it("shows labelled delete actions and hides previously revoked tokens", async () => {
    const view = renderSection()

    const button = await view.findByRole("button", { name: "Delete token Claude Desktop" })
    expect(button.textContent).toBe("Delete token")
    expect(view.getByRole("button", { name: "Delete token Other client" })).toBeDefined()
    expect(view.queryByText("Old client")).toBeNull()
    expect(view.queryByText("Revoked")).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
  })

  it.each(["Cancel", "Close"])("keeps the named token when confirmation is dismissed with %s", async (action) => {
    const view = renderSection()
    const dialog = await openDelete(view)

    expect(dialog.getByText("Claude Desktop")).toBeDefined()
    expect(dialog.getByText(/Any clients using it will need a new token/)).toBeDefined()
    fireEvent.click(dialog.getByRole("button", { name: action, exact: true }))

    expect(view.queryByRole("dialog")).toBeNull()
    expect(view.getByRole("button", { name: "Delete token Claude Desktop" })).toBeDefined()
    expect(revoke).not.toHaveBeenCalled()
  })

  it("removes only the confirmed token after success and keeps it hidden after a fresh load", async () => {
    const pending = Promise.withResolvers<void>()
    revoke.mockImplementationOnce(async (id) => {
      await pending.promise
      revokeOnServer(id)
    })
    const view = renderSection()
    const dialog = await openDelete(view)
    fireEvent.click(dialog.getByRole("button", { name: "Delete token", exact: true }))

    const deleting = await dialog.findByRole("button", { name: "Deleting..." })
    expect((deleting as HTMLButtonElement).disabled).toBe(true)
    expect((dialog.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByRole("button", { name: "Delete token Claude Desktop" }) as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByRole("button", { name: "Delete token Other client" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(deleting)
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith("token-desktop")
    expect(serverTokens.find((item) => item.id === "token-desktop")?.revokedAt).toBeNull()

    await act(async () => { pending.resolve() })
    await waitFor(() => {
      expect(view.queryByRole("button", { name: "Delete token Claude Desktop" }) === null).toBe(true)
      expect(view.queryByRole("dialog") === null).toBe(true)
    })
    expect(view.getByRole("button", { name: "Delete token Other client" })).toBeDefined()
    expect(serverTokens.find((item) => item.id === "token-desktop")?.revokedAt).not.toBeNull()

    view.unmount()
    const refreshed = renderSection()
    await refreshed.findByRole("button", { name: "Delete token Other client" })
    expect(refreshed.queryByText("Claude Desktop")).toBeNull()
    expect(refreshed.queryByText("Old client")).toBeNull()
  })

  it.each([
    ["API failure", new ApiErrorResponse({ code: "INTERNAL_ERROR", message: "Failed to revoke token" }), "Failed to revoke token"],
    ["network failure", new Error("Network unavailable"), "Failed to delete token. Please try again."],
  ] as const)("keeps the token after %s and allows a retry", async (_, error, message) => {
    revoke.mockRejectedValueOnce(error)
    const view = renderSection()
    const dialog = await openDelete(view)
    fireEvent.click(dialog.getByRole("button", { name: "Delete token", exact: true }))

    expect((await dialog.findByRole("alert")).textContent).toBe(message)
    expect(view.getByRole("button", { name: "Delete token Claude Desktop" })).toBeDefined()
    expect(serverTokens.find((item) => item.id === "token-desktop")?.revokedAt).toBeNull()
    expect((dialog.getByRole("button", { name: "Delete token", exact: true }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(dialog.getByRole("button", { name: "Delete token", exact: true }))
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true))
    expect(view.queryByRole("alert")).toBeNull()
    expect(view.queryByRole("button", { name: "Delete token Claude Desktop" })).toBeNull()
    expect(revoke).toHaveBeenCalledTimes(2)
  })

  it("removes the token after success even if the list refresh fails", async () => {
    serverTokens = [token()]
    const view = renderSection()
    const dialog = await openDelete(view)
    list.mockRejectedValue(new Error("List unavailable"))

    fireEvent.click(dialog.getByRole("button", { name: "Delete token", exact: true }))

    await view.findByText("No access tokens. Create one to let an AI agent access Tuesday.")
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true))
    expect(view.queryByRole("button", { name: "Delete token Claude Desktop" })).toBeNull()
    expect(view.queryByRole("alert")).toBeNull()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it("does not restore a deleted token when an older list request finishes late", async () => {
    const view = renderSection()
    const dialog = await openDelete(view)
    const staleTokens = structuredClone(serverTokens)
    const pendingList = Promise.withResolvers<McpTokenListItem[]>()
    list.mockImplementationOnce(() => pendingList.promise)
    act(() => { void view.queryClient.refetchQueries({ queryKey: ["mcp-tokens"] }) })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))

    fireEvent.click(dialog.getByRole("button", { name: "Delete token", exact: true }))
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true))
    await act(async () => { pendingList.resolve(staleTokens) })

    expect(view.queryByRole("button", { name: "Delete token Claude Desktop" })).toBeNull()
    expect(view.getByRole("button", { name: "Delete token Other client" })).toBeDefined()
  })

  it("shows a failure even if the dialog is closed while deleting", async () => {
    const pending = Promise.withResolvers<void>()
    revoke.mockImplementationOnce(() => pending.promise)
    const view = renderSection()
    const dialog = await openDelete(view)
    fireEvent.click(dialog.getByRole("button", { name: "Delete token", exact: true }))
    await dialog.findByRole("button", { name: "Deleting..." })
    fireEvent.click(dialog.getByRole("button", { name: "Close", exact: true }))

    expect(view.queryByRole("dialog")).toBeNull()
    expect((view.getByRole("button", { name: "Delete token Claude Desktop" }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { pending.reject(new Error("Network unavailable")) })
    expect((await view.findByRole("alert")).textContent).toContain("Please try again")

    const retryDialog = await openDelete(view)
    expect(view.queryByRole("alert")).toBeNull()
    fireEvent.click(retryDialog.getByRole("button", { name: "Delete token", exact: true }))
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true))
    expect(view.queryByRole("button", { name: "Delete token Claude Desktop" })).toBeNull()
  })
})
