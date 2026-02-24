import "@/test/setup"
import { describe, it, expect, beforeEach, mock } from "bun:test"
import type { ReactNode } from "react"

type MockDoc = {
  id: string
  title: string
  content: Array<Record<string, unknown>>
  parentId: string | null
  parent: null
  isDatabase: boolean
  schema: null
  properties: Record<string, unknown>
  children: Array<unknown>
}

const updateDocMutate = mock(async () => ({ id: "doc-updated" }))
const createDocMutate = mock(async () => ({ id: "doc-created" }))
const deleteDocMutate = mock(async () => true)

let currentDoc: MockDoc | null = null
let currentDebouncedContent: { docId: string; content: Array<Record<string, unknown>> } | null = null
let currentParams: { id?: string; docId: string } = { docId: "doc-1" }

mock.module("react-router-dom", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  useNavigate: () => mock(() => {}),
  useParams: () => currentParams,
  useSearchParams: () => [new URLSearchParams(), mock(() => {})],
}))

mock.module("@/hooks/use-docs", () => ({
  useDocWithChildren: () => ({
    data: currentDoc,
    isLoading: false,
    error: null,
  }),
  useDocs: () => ({
    createDoc: {
      mutateAsync: createDocMutate,
      isPending: false,
    },
    updateDoc: {
      mutateAsync: updateDocMutate,
    },
    deleteDoc: {
      mutateAsync: deleteDocMutate,
    },
  }),
}))

mock.module("@/hooks/use-debounce", () => ({
  useDebounce: () => currentDebouncedContent,
}))

mock.module("@/store/ui-store", () => ({
  useUIStore: (selector: (state: { chatPanelWidth: number; setChatPanelWidth: () => void; docSidebarWidth: number; setDocSidebarWidth: () => void }) => unknown) =>
    selector({
      chatPanelWidth: 360,
      setChatPanelWidth: () => {},
      docSidebarWidth: 280,
      setDocSidebarWidth: () => {},
    }),
}))

mock.module("@/components/docs/block-note-editor", () => ({
  BlockNoteEditor: () => <div data-testid="block-note-editor" />,
}))

mock.module("@/components/docs/database-view", () => ({
  DatabaseView: () => <div />,
}))

mock.module("@/components/docs/properties-panel", () => ({
  PropertiesPanel: () => <div />,
}))

mock.module("@/components/docs/doc-toolbar", () => ({
  DocToolbar: () => <div data-testid="doc-toolbar" />,
}))

mock.module("@/components/docs/doc-sidebar", () => ({
  DocSidebar: () => <div />,
}))

mock.module("@/components/layout/resizable-split", () => ({
  ResizableSplit: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

mock.module("@/components/chat/chat-view", () => ({
  ChatView: () => <div />,
}))

mock.module("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}))

mock.module("@/components/ui/card", () => ({
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

mock.module("@/components/ui/input", () => ({
  Input: () => <input />,
}))

mock.module("@/components/ui/skeleton", () => ({
  Skeleton: () => <div />,
}))

mock.module("@/lib/icons", () => ({
  ArrowLeft: () => <span />,
  FileText: () => <span />,
  Pencil: () => <span />,
  Table: () => <span />,
  X: () => <span />,
}))

const { render, waitFor } = await import("@testing-library/react")
const { DocPage } = await import("./doc-page")

const makeDoc = (id: string): MockDoc => ({
  id,
  title: `Doc ${id}`,
  content: [],
  parentId: null,
  parent: null,
  isDatabase: false,
  schema: null,
  properties: {},
  children: [],
})

const block = (text: string) => ({
  id: `block-${text}`,
  type: "paragraph",
  props: {},
  content: [{ type: "text", text, styles: {} }],
})

describe("DocPage autosave guards", () => {
  beforeEach(() => {
    updateDocMutate.mockClear()
    createDocMutate.mockClear()
    deleteDocMutate.mockClear()
    currentDebouncedContent = null
    currentDoc = makeDoc("doc-a")
    currentParams = { docId: "doc-a" }
  })

  it("does not persist stale debounced content after switching docs", async () => {
    const { rerender } = render(<DocPage />)

    currentDoc = makeDoc("doc-b")
    currentParams = { docId: "doc-b" }
    currentDebouncedContent = {
      docId: "doc-a",
      content: [block("stale")],
    }

    rerender(<DocPage />)

    await waitFor(() => {
      expect(updateDocMutate.mock.calls.length).toBe(0)
    })
  })

  it("persists debounced content when it belongs to the active doc", async () => {
    const { rerender } = render(<DocPage />)

    currentDebouncedContent = {
      docId: "doc-a",
      content: [block("fresh")],
    }

    rerender(<DocPage />)

    await waitFor(() => {
      expect(updateDocMutate.mock.calls.length).toBe(1)
    })

    expect(updateDocMutate.mock.calls[0]?.[0]).toEqual({
      docId: "doc-a",
      data: { content: [block("fresh")] },
    })
  })
})
