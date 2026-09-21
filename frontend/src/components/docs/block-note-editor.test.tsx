import { createRef, type ReactNode } from "react"
import type { BlockNoteEditorHandle } from "./block-note-editor"
import "@/test/setup"
import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { Window } from "happy-dom"

if (typeof globalThis.document === "undefined") {
  const window = new Window()
  globalThis.window = window as unknown as Window & typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.navigator = window.navigator as unknown as Navigator
}

const { fireEvent, render } = await import("@testing-library/react")
const actualY = await import("yjs")

const sendSnapshot = mock(() => {})
const blocksToYDoc = mock(() => ({ seeded: true, destroy() {} }))
const encodeStateAsUpdate = mock(() => new Uint8Array([1, 2, 3]))
const applyUpdate = mock(() => {})
let latestCollabOptions: { onLocalChange?: () => void } | undefined

const editorState = {
  isEditable: true,
  getExtension: () => undefined,
  document: [{ id: "block-1", type: "paragraph", props: {}, content: [] }],
}

const collabState = {
  ydoc: { getXmlFragment: () => ({ length: 0 }) },
  awareness: { getLocalState: () => ({ user: { name: "Test", color: "#0F766E" } }) },
  syncState: "synced" as "synced" | "connecting" | "error",
  syncError: null as null | { code: string; message: string; requiresReload: true; pendingUpdateCount: number },
  hasRemoteContent: true,
  initialSyncComplete: true,
  sendSnapshot,
  getRecoveryCopy: () => ({ format: "tuesday-doc-recovery-v1", docId: "doc-1", generation: "old", snapshot: "AQID", pendingUpdates: [{ operationId: "pending" }] }),
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
  BlockNoteView: ({ children }: { children?: ReactNode }) => <div data-testid="blocknote-view">{children}</div>,
}))

mock.module("@blocknote/shadcn/style.css", () => ({}))
mock.module("@blocknote/core/yjs", () => ({
  blocksToYDoc,
}))
mock.module("yjs", () => ({
  ...actualY,
  encodeStateAsUpdate,
  applyUpdate,
}))
mock.module("@blocknote/core/extensions", () => ({
  SideMenuExtension: {},
  TableHandlesExtension: {},
}))

mock.module("@blocknote/code-block", () => ({
  codeBlockOptions: {},
}))

mock.module("@/hooks/use-doc-collaboration", () => ({
  useDocCollaboration: (_docId: string, options?: { onLocalChange?: () => void }) => {
    latestCollabOptions = options
    return collabState
  },
}))

describe("BlockNoteEditor", () => {
  beforeEach(() => {
    sendSnapshot.mockClear()
    blocksToYDoc.mockClear()
    encodeStateAsUpdate.mockClear()
    applyUpdate.mockClear()
    latestCollabOptions = undefined
    collabState.syncState = "synced"
    collabState.syncError = null
    collabState.hasRemoteContent = true
    collabState.initialSyncComplete = true
    editorState.isEditable = true
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

  it("exports current read-only editor content only after initial sync and isolates the snapshot", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    const exportRef = createRef<BlockNoteEditorHandle>()
    const readiness = mock(() => {})
    collabState.initialSyncComplete = false
    collabState.hasRemoteContent = false
    const view = render(<BlockNoteEditor docId="live-doc" initialContent={[]} editable={false} exportRef={exportRef} onReadyChange={readiness} />)
    expect(exportRef.current?.getBlocks()).toBeNull()
    collabState.initialSyncComplete = true
    collabState.hasRemoteContent = true
    view.rerender(<BlockNoteEditor docId="live-doc" initialContent={[]} editable={false} exportRef={exportRef} onReadyChange={readiness} />)
    const original = editorState.document
    try {
      // Remote changes need not trigger the local onChange callback or a React render.
      editorState.document = [{ id: "received-remote-block", type: "paragraph", props: {}, content: [] }]
      const snapshot = exportRef.current!.getBlocks()!
      expect(snapshot[0]!.id).toBe("received-remote-block")
      editorState.document[0]!.id = "newer-local-edit"
      expect(snapshot[0]!.id).toBe("received-remote-block")
      expect(exportRef.current!.getBlocks()![0]!.id).toBe("newer-local-edit")
      expect(readiness).toHaveBeenCalledWith("live-doc", true)
    } finally { editorState.document = original }
    view.unmount()
    expect(readiness).toHaveBeenLastCalledWith("live-doc", false)
    expect(exportRef.current).toBeNull()
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

    latestCollabOptions?.onLocalChange?.()

    expect(received).toBeDefined()
  })

  it("keeps read-only documents interactive for reading, including during reconnect", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    const view = render(<BlockNoteEditor docId="doc-1" initialContent={[]} editable={false} />)
    const container = view.getByTestId("blocknote-view").parentElement!
    expect(container.inert).toBe(false)
    expect(editorState.isEditable).toBe(false)
    collabState.initialSyncComplete = false
    view.rerender(<BlockNoteEditor docId="doc-1" initialContent={[]} editable={false} />)
    expect(container.inert).toBe(false)
    expect(editorState.isEditable).toBe(false)
  })

  it("exports local blocks and history before enabling reload with pending edits", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    const view = render(<BlockNoteEditor docId="doc-1" initialContent={[]} />)
    collabState.syncError = { code: "resync_required", message: "Save local work", requiresReload: true, pendingUpdateCount: 1 }
    collabState.initialSyncComplete = false
    view.rerender(<BlockNoteEditor docId="doc-1" initialContent={[]} />)
    const reload = view.getByRole("button", { name: "Reload page" }) as HTMLButtonElement
    expect(reload.disabled).toBe(true)
    expect(view.getByTestId("blocknote-view").parentElement!.inert).toBe(false)
    expect(editorState.isEditable).toBe(false)
    let exported: Blob | undefined
    const create = spyOn(URL, "createObjectURL").mockImplementation(blob => { exported = blob as Blob; return "blob:recovery" })
    const click = spyOn(Object.getPrototypeOf(document.createElement("a")), "click").mockImplementation(() => {})
    try {
      fireEvent.click(view.getByRole("button", { name: "Download recovery copy" }))
      expect(JSON.parse(await exported!.text())).toMatchObject({ generation: "old", snapshot: "AQID", blocks: editorState.document,
        pendingUpdates: [{ operationId: "pending" }] })
      expect(click).toHaveBeenCalledTimes(1)
      expect(reload.disabled).toBe(false)
      expect(sendSnapshot).not.toHaveBeenCalled()
    } finally { create.mockRestore(); click.mockRestore() }
  })

  it("keeps reload disabled if recovery export fails", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    collabState.syncError = { code: "resync_required", message: "Save local work", requiresReload: true, pendingUpdateCount: 1 }
    const view = render(<BlockNoteEditor docId="doc-1" initialContent={[]} />)
    const create = spyOn(URL, "createObjectURL").mockImplementation(() => { throw new Error("Unavailable") })
    try {
      fireEvent.click(view.getByRole("button", { name: "Download recovery copy" }))
      expect((view.getByRole("button", { name: "Reload page" }) as HTMLButtonElement).disabled).toBe(true)
      expect(view.getByText(/could not be downloaded/)).toBeDefined()
    } finally { create.mockRestore() }
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
    expect(blocksToYDoc).not.toHaveBeenCalled()
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

    expect(blocksToYDoc).toHaveBeenCalledTimes(1)
    expect(blocksToYDoc).toHaveBeenCalledWith(editorState, initialContent, "prosemirror")
    expect(encodeStateAsUpdate).toHaveBeenCalledTimes(1)
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(sendSnapshot).toHaveBeenCalledWith()
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

    expect(blocksToYDoc).not.toHaveBeenCalled()
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
    expect(sendSnapshot).toHaveBeenCalledWith()
  })

  it("disables the editor and asks for a reload after a fatal sync error", async () => {
    const { BlockNoteEditor } = await import("./block-note-editor")
    collabState.syncError = {
      code: "resync_required",
      message: "This document must be resynchronized. Reload the page before editing.",
      requiresReload: true,
      pendingUpdateCount: 0,
    }
    collabState.initialSyncComplete = false

    const view = render(<BlockNoteEditor docId="doc-1" initialContent={[]} />)

    expect(view.queryByTestId("blocknote-view")).toBeNull()
    expect(view.getByRole("alert").textContent).toContain("must be resynchronized")
    expect(view.getByRole("button", { name: "Reload page" })).toBeDefined()
  })
})
