import type { ReactNode } from "react"
import "@/test/setup"
import { describe, it, expect, mock } from "bun:test"

const { render } = await import("@testing-library/react")

let unfreezeMenuCallCount = 0
let hasInitializedSideMenuState = true
let throwOnUnfreeze = false

mock.module("@/store/ui-store", () => ({
  useUIStore: (selector: (state: { theme: "light" | "dark" | "system" }) => unknown) =>
    selector({ theme: "light" }),
}))

mock.module("@blocknote/react", () => ({
  useCreateBlockNote: () => ({
    document: [{ id: "block-1", type: "paragraph", props: {}, content: [] }],
    getExtension: () => ({
      store: {
        state: hasInitializedSideMenuState ? { show: true } : undefined,
      },
      unfreezeMenu: () => {
        if (throwOnUnfreeze) {
          throw new Error("unfreezeMenu should not be called")
        }
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
    hasInitializedSideMenuState = true
    throwOnUnfreeze = false

    render(<SimpleBlockNoteEditor initialContent={[]} />)

    expect(unfreezeMenuCallCount).toBeGreaterThan(0)
  })

  it("should not unfreeze when side menu state is not initialized", async () => {
    const { SimpleBlockNoteEditor } = await import("./simple-block-note-editor")
    unfreezeMenuCallCount = 0
    hasInitializedSideMenuState = false
    throwOnUnfreeze = true

    expect(() => render(<SimpleBlockNoteEditor initialContent={[]} />)).not.toThrow()
    expect(unfreezeMenuCallCount).toBe(0)

    hasInitializedSideMenuState = true
    throwOnUnfreeze = false
  })
})
