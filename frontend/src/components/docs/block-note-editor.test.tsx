import type { ReactNode } from "react"
import "@/test/setup"
import { beforeEach, describe, expect, it, mock } from "bun:test"
import { Window } from "happy-dom"

if (typeof globalThis.document === "undefined") {
  const window = new Window()
  globalThis.window = window as unknown as Window & typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.navigator = window.navigator as unknown as Navigator
}

const { fireEvent, render } = await import("@testing-library/react")

const replaceBlocks = mock(() => {})
const sendSnapshot = mock(() => {})

const editorState = {
  document: [{ id: "block-1", type: "paragraph", props: {}, content: [] }],
  replaceBlocks,
}

const collabState = {
  ydoc: { getXmlFragment: () => ({ length: 0 }) },
  awareness: { getLocalState: () => ({ user: { name: "Test", color: "#0F766E" } }) },
  syncState: "synced" as const,
  hasRemoteContent: true,
  initialSyncComplete: true,
  sendSnapshot,
}

mock.module("@blocknote/react", () => ({
  useCreateBlockNote: () => editorState,
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
  useDocCollaboration: () => collabState,
}))

describe("BlockNoteEditor", () => {
  beforeEach(() => {
    replaceBlocks.mockClear()
    sendSnapshot.mockClear()
    collabState.syncState = "synced"
    collabState.hasRemoteContent = true
    collabState.initialSyncComplete = true
  })

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

  it("does not emit changes before initial sync completes", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    collabState.initialSyncComplete = false
    collabState.hasRemoteContent = false
    let received: unknown

    render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={[{ id: "seed-1", type: "paragraph", props: {}, content: [] }]}
        onChange={(content) => {
          received = content
        }}
      />
    )

    expect(received).toBeUndefined()
    expect(replaceBlocks).not.toHaveBeenCalled()
  })

  it("seeds initial content once after sync when no remote content exists", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    collabState.hasRemoteContent = false

    const initialContent = [{ id: "seed-1", type: "paragraph", props: {}, content: [] }]

    render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={initialContent}
      />
    )

    expect(replaceBlocks).toHaveBeenCalledTimes(1)
    expect(replaceBlocks).toHaveBeenCalledWith(editorState.document, initialContent)
  })

  it("does not seed initial content when remote collab content already exists", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    collabState.hasRemoteContent = true

    render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={[{ id: "seed-1", type: "paragraph", props: {}, content: [] }]}
      />
    )

    expect(replaceBlocks).not.toHaveBeenCalled()
  })

  it("publishes a collaborative snapshot on blur", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")

    const { getByTestId } = render(
      <BlockNoteEditor
        docId="doc-1"
        initialContent={[]}
      />
    )

    fireEvent.blur(getByTestId("blocknote-view").parentElement as HTMLElement)

    expect(sendSnapshot).toHaveBeenCalledTimes(1)
    expect(sendSnapshot).toHaveBeenCalledWith(editorState.document)
  })
})
