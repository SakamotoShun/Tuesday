import "@/test/setup"
import React from "react"
import { describe, it, expect, mock } from "bun:test"
import { Window } from "happy-dom"

if (typeof globalThis.document === "undefined") {
  const window = new Window()
  globalThis.window = window as unknown as Window & typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.navigator = window.navigator as unknown as Navigator
}

const { render } = await import("@testing-library/react")
import type { Doc } from "@/api/types"

mock.module("@/components/docs/doc-tree-item", () => ({
  DocTreeItem: ({ doc, children }: { doc: Doc; children: Doc[] }) => (
    <div data-testid={`doc-${doc.id}`}>
      {doc.title} ({children.length})
    </div>
  ),
}))

const { DocList } = await import("./doc-list")

const docs: Doc[] = [
  {
    id: "doc-1",
    projectId: "project-1",
    parentId: null,
    title: "Root Doc",
    content: [],
    properties: {},
    isDatabase: false,
    schema: null,
    createdBy: "user-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "doc-2",
    projectId: "project-1",
    parentId: "doc-1",
    title: "Child Doc",
    content: [],
    properties: {},
    isDatabase: false,
    schema: null,
    createdBy: "user-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
]

describe("DocList", () => {
  it("renders root docs with children counts", () => {
    const { getByText, getByTestId } = render(
      <DocList
        docs={docs}
        projectId="project-1"
        onRename={async () => {}}
        onDelete={async () => {}}
      />
    )

    expect(getByText("Root Doc (1)")).toBeDefined()
    expect(getByTestId("doc-doc-1")).toBeDefined()
  })
})
