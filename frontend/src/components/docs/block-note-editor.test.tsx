import type { ReactNode } from "react"
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

let unfreezeMenuCallCount = 0
let hasInitializedSideMenuState = true
let throwOnUnfreeze = false
let replaceBlocksCallCount = 0
let transactCallCount = 0
let setMetaCalls: Array<{ key: string; value: unknown }> = []
let collabSyncState: "connecting" | "synced" | "error" = "synced"
let collabHasRemoteContent = true
let collabFragmentLength = 0

const editorDocument = [{ id: "block-1", type: "paragraph", props: {}, content: [] }]

const createEditorMock = () => ({
  document: editorDocument,
  replaceBlocks: () => {
    replaceBlocksCallCount += 1
  },
  transact: (callback: (tr: { setMeta: (key: string, value: unknown) => void }) => void) => {
    transactCallCount += 1
    callback({
      setMeta: (key, value) => {
        setMetaCalls.push({ key, value })
      },
    })
  },
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
})

let editorMock = createEditorMock()

mock.module("@blocknote/react", () => ({
  useCreateBlockNote: () => editorMock,
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
mock.module("@blocknote/core/extensions", () => ({
  SideMenuExtension: {},
}))

mock.module("@blocknote/code-block", () => ({
  codeBlockOptions: {},
}))

mock.module("@/hooks/use-doc-collaboration", () => ({
  useDocCollaboration: () => ({
    ydoc: { getXmlFragment: () => ({ length: collabFragmentLength }) },
    awareness: { getLocalState: () => ({ user: { name: "Test", color: "#0F766E" } }) },
    syncState: collabSyncState,
    hasRemoteContent: collabHasRemoteContent,
  }),
}))

const resetState = () => {
  unfreezeMenuCallCount = 0
  hasInitializedSideMenuState = true
  throwOnUnfreeze = false
  replaceBlocksCallCount = 0
  transactCallCount = 0
  setMetaCalls = []
  collabSyncState = "synced"
  collabHasRemoteContent = true
  collabFragmentLength = 0
  editorMock = createEditorMock()
}

describe("BlockNoteEditor", () => {
  it("should render the editor view", async () => {
    resetState()
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
    resetState()
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
    expect(unfreezeMenuCallCount).toBeGreaterThan(0)
  })

  it("should unfreeze the side menu on change", async () => {
    resetState()
    const { BlockNoteEditor } = await import("./block-note-editor")

    render(<BlockNoteEditor docId="doc-1" initialContent={[]} />)

    expect(unfreezeMenuCallCount).toBeGreaterThan(0)
  })

  it("should not unfreeze when side menu state is not initialized", async () => {
    resetState()
    const { BlockNoteEditor } = await import("./block-note-editor")
    hasInitializedSideMenuState = false
    throwOnUnfreeze = true
    editorMock = createEditorMock()

    expect(() => render(<BlockNoteEditor docId="doc-1" initialContent={[]} />)).not.toThrow()
    expect(unfreezeMenuCallCount).toBe(0)

    hasInitializedSideMenuState = true
    throwOnUnfreeze = false
  })

  it("should not seed initial content while collab is connecting", async () => {
    resetState()
    collabSyncState = "connecting"
    collabHasRemoteContent = false
    collabFragmentLength = 0
    editorMock = createEditorMock()

    const { BlockNoteEditor } = await import("./block-note-editor")

    render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={[{ id: "initial-1", type: "paragraph", props: {}, content: [] } as any]}
      />
    )

    expect(transactCallCount).toBe(0)
    expect(replaceBlocksCallCount).toBe(0)
    expect(setMetaCalls).toEqual([])
  })

  it("should seed initial content with no-history when collab is ready and empty", async () => {
    resetState()
    collabSyncState = "synced"
    collabHasRemoteContent = false
    collabFragmentLength = 0
    editorMock = createEditorMock()

    const { BlockNoteEditor } = await import("./block-note-editor")

    render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={[{ id: "initial-1", type: "paragraph", props: {}, content: [] } as any]}
      />
    )

    expect(transactCallCount).toBe(1)
    expect(replaceBlocksCallCount).toBe(1)
    expect(setMetaCalls).toEqual([{ key: "addToHistory", value: false }])
  })
})
