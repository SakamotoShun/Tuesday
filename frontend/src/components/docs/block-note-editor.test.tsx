import { describe, it, expect, mock } from "bun:test"
import { render, screen } from "@testing-library/react"

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

describe("BlockNoteEditor", () => {
  it("should render the editor view", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    render(
      <BlockNoteEditor
        initialContent={[]}
        onChange={() => {
          // no-op
        }}
      />
    )

    expect(screen.getByTestId("blocknote-view")).toBeDefined()
  })

  it("should call onChange with document blocks", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    let received: unknown

    render(
      <BlockNoteEditor
        initialContent={[]}
        onChange={(content) => {
          received = content
        }}
      />
    )

    expect(received).toBeDefined()
  })
})
