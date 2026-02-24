import "@/test/setup"
import { describe, expect, it } from "bun:test"
import { shouldPersistDocContent } from "./doc-page"

describe("shouldPersistDocContent", () => {
  it("returns false when content belongs to a different doc", () => {
    expect(
      shouldPersistDocContent({
        activeDocId: "doc-b",
        renderedDocId: "doc-b",
        targetDocId: "doc-a",
      })
    ).toBe(false)
  })

  it("returns false when rendered doc does not match target doc", () => {
    expect(
      shouldPersistDocContent({
        activeDocId: "doc-a",
        renderedDocId: "doc-b",
        targetDocId: "doc-a",
      })
    ).toBe(false)
  })

  it("returns true only when active, rendered, and target docs all match", () => {
    expect(
      shouldPersistDocContent({
        activeDocId: "doc-a",
        renderedDocId: "doc-a",
        targetDocId: "doc-a",
      })
    ).toBe(true)
  })
})
