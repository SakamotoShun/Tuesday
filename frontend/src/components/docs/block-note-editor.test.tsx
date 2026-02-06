import "@/test/setup"
import { describe, it, expect, mock } from "bun:test"
import { Window } from "happy-dom"

if (typeof globalThis.document === "undefined") {
  const window = new Window()
  globalThis.window = window as unknown as Window & typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.navigator = window.navigator as unknown as Navigator
}

const { render } = await import("@testing-library/react")

mock.module("@blocknote/react", () => ({
  useCreateBlockNote: () => ({
    document: [{ id: "block-1", type: "paragraph", props: {}, content: [] }],
  }),
}))

mock.module("@blocknote/shadcn", () => ({
  BlockNoteView: ({ onChange }: { onChange?: () => void }) => {
    onChange?.()
    return <div data-testid="blocknote-view" />
  },
}))

mock.module("@blocknote/shadcn/style.css", () => ({}))

mock.module("@/hooks/use-doc-collaboration", () => ({
  useDocCollaboration: () => ({
    ydoc: { getXmlFragment: () => ({ length: 0 }) },
    awareness: { getLocalState: () => ({ user: { name: "Test", color: "#0F766E" } }) },
    syncState: "synced",
    hasRemoteContent: true,
  }),
}))

describe("BlockNoteEditor", () => {
  it("should render the editor view", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    const { getByTestId } = render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={[]}
        onChange={() => {
          // no-op
        }}
      />
    )

    expect(getByTestId("blocknote-view")).toBeDefined()
  })

  it("should call onChange with document blocks", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    let received: unknown

    render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={[]}
        onChange={(content) => {
          received = content
        }}
      />
    )

    expect(received).toBeDefined()
  })
})
