import type { ReactNode } from "react"
import "@/test/setup"
import { describe, it, expect, mock } from "bun:test"

const { render } = await import("@testing-library/react")

let unfreezeMenuCallCount = 0

mock.module("@/store/ui-store", () => ({
  useUIStore: (selector: (state: { theme: "light" | "dark" | "system" }) => unknown) =>
    selector({ theme: "light" }),
}))

mock.module("@blocknote/react", () => ({
  useCreateBlockNote: () => ({
    document: [{ id: "block-1", type: "paragraph", props: {}, content: [] }],
    getExtension: () => ({
      unfreezeMenu: () => {
        unfreezeMenuCallCount += 1
      },
    }),
  }),
  SideMenuController: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SideMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DragHandleMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  RemoveBlockItem: ({ children }: { children?: ReactNode }) => <>{children}</>,
  BlockColorsItem: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useBlockNoteEditor: () => ({}),
  useComponentsContext: () => ({
    Generic: {
      Menu: {
        Item: ({ children }: { children?: ReactNode }) => <>{children}</>,
      },
    },
  }),
  useExtensionState: () => undefined,
}))

mock.module("@blocknote/shadcn", () => ({
  BlockNoteView: ({ onChange, children }: { onChange?: () => void; children?: ReactNode }) => {
    onChange?.()
    return <div data-testid="blocknote-view">{children}</div>
  },
}))

mock.module("@blocknote/shadcn/style.css", () => ({}))

mock.module("@blocknote/code-block", () => ({
  codeBlockOptions: {},
}))

describe("SimpleBlockNoteEditor", () => {
  it("should unfreeze the side menu on change", async () => {
    const { SimpleBlockNoteEditor } = await import("./simple-block-note-editor")
    unfreezeMenuCallCount = 0

    render(<SimpleBlockNoteEditor initialContent={[]} />)

    expect(unfreezeMenuCallCount).toBeGreaterThan(0)
  })
})
