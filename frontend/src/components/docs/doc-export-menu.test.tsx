import "@/test/setup"
import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { DocExportMenu } from "./doc-export-menu"
import { block, text } from "../../../e2e/doc-export-fixture"

const browserGlobals = {
  getComputedStyle: window.getComputedStyle.bind(window),
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
  NodeFilter: window.NodeFilter,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
}
const originalGlobals = Object.fromEntries(Object.keys(browserGlobals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
beforeAll(() => Object.assign(globalThis, browserGlobals))
afterAll(() => {
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

afterEach(cleanup)

describe("DocExportMenu", () => {
  it("disables export until the live document is ready", () => {
    const view = render(<DocExportMenu ready={false} getSnapshot={() => { throw new Error("Must not read before ready") }} />)
    expect((view.getByRole("button", { name: "Export document" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("downloads a click-time snapshot with the document title as filename", async () => {
    let latest = "Original content"
    let downloaded: Blob | undefined
    let filename = ""
    const create = spyOn(URL, "createObjectURL").mockImplementation((blob) => { downloaded = blob as Blob; return "blob:export" })
    const click = spyOn(Object.getPrototypeOf(document.createElement("a")), "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download })
    try {
      const view = render(<DocExportMenu ready getSnapshot={() => ({ title: "Live / document", blocks: [block("paragraph", text(latest))] })} />)
      fireEvent.click(view.getByRole("button", { name: "Export document" }))
      latest = "Recent collaborator update"
      await act(async () => { fireEvent.click(view.getByRole("button", { name: "Download Markdown (.md)" })) })
      await waitFor(() => expect(downloaded).toBeDefined())
      expect(filename).toBe("Live - document.md")
      expect(await downloaded!.text()).toContain("Recent collaborator update")
      expect(await downloaded!.text()).not.toContain("Original content")
      expect(click).toHaveBeenCalledTimes(1)
      expect(view.getByRole("status").textContent).toBe("Export download started")
    } finally { create.mockRestore(); click.mockRestore() }
  })

  it("reports failures and allows retry without downloading an incomplete document", async () => {
    const click = spyOn(Object.getPrototypeOf(document.createElement("a")), "click").mockImplementation(() => {})
    try {
      const view = render(<DocExportMenu ready getSnapshot={() => null} />)
      fireEvent.click(view.getByRole("button", { name: "Export document" }))
      await act(async () => { fireEvent.click(view.getByRole("button", { name: "Download PDF (.pdf)" })) })
      expect(view.getByRole("alert").textContent).toContain("still loading")
      expect(click).not.toHaveBeenCalled()
      fireEvent.click(view.getAllByRole("button", { name: "Close", exact: true })[0]!)
      expect((view.getByRole("button", { name: "Export document" }) as HTMLButtonElement).disabled).toBe(false)
    } finally { click.mockRestore() }
  })
})
