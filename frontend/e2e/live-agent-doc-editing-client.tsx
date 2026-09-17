import { useEffect } from "react"
import { createRoot } from "react-dom/client"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import * as Y from "yjs"
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness"
import { redo, undo, ySyncPluginKey, yUndoPluginKey } from "y-prosemirror"
// The runner's noDiscovery prebundle must include prosemirror-state too.
import { TextSelection } from "prosemirror-state"
import { blockNoteSchema } from "../src/components/docs/block-note-schema"
import { createStructuralCapture } from "./doc-structural-capture"
import { createContinuityBridge } from "./doc-continuity-bridge"
import "@blocknote/shadcn/style.css"

const params = new URLSearchParams(location.search)
const client = params.get("client")!
const continuityMode = params.get("continuity") === "1"
if (continuityMode && params.get("capture") === "1") throw new Error("Capture and continuity modes are mutually exclusive")
let continuity: ReturnType<typeof createContinuityBridge> | null = null
let initialHeads: string[] = []
let initialIncomplete = false
const ydoc = new Y.Doc()
const awareness = new Awareness(ydoc)
awareness.setLocalStateField("user", { name: client, color: client === "a" ? "#2563eb" : "#c2410c" })
const socket = new WebSocket(params.get("relay")!)
const pending = new Set<number>()
let messageId = 0
let syncs = 0
let agentUpdates = 0
let mounts = 0
let unmounts = 0
let detachments = 0

ydoc.on("update", (update: Uint8Array, origin: unknown) => {
  if (origin === "relay" || continuityMode) return
  const id = ++messageId
  pending.add(id)
  socket.send(JSON.stringify({ type: "update", id, update: Array.from(update) }))
})
awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
  if (origin === "relay" || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({
    type: "awareness",
    update: Array.from(encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])),
  }))
})

await new Promise<void>((resolve, reject) => {
  socket.onerror = () => reject(new Error("Loopback relay connection failed"))
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.type === "sync" || message.type === "update") {
      if (message.missing && continuity) continuity.missing(new Uint8Array(message.update))
      else Y.applyUpdate(ydoc, new Uint8Array(message.update), "relay")
      if (message.type === "sync") {
        initialHeads = message.heads ?? []
        initialIncomplete = message.incomplete === true
        syncs++
        socket.send(JSON.stringify({ type: "awareness", update: Array.from(encodeAwarenessUpdate(awareness, [ydoc.clientID])) }))
        resolve()
      }
      if (message.agent) agentUpdates++
    } else if (message.type === "continuity") {
      if (!continuity) throw new Error("Continuity packet outside its mode")
      continuity.receive(message.packet)
      if (message.agent) agentUpdates++
    } else if (message.type === "ack") {
      if (!pending.delete(message.id)) throw new Error(`Unexpected ack ${message.id}`)
    } else if (message.type === "awareness") {
      applyAwarenessUpdate(awareness, new Uint8Array(message.update), "relay")
    }
  }
})

const capture = params.get("capture") === "1" ? createStructuralCapture(ydoc) : null
if (continuityMode) continuity = createContinuityBridge(ydoc, initialHeads, message => {
  const id = ++messageId
  pending.add(id)
  socket.send(JSON.stringify({ ...message, id }))
}, Number(params.get("capacity") ?? 32), params.has("evidenceDoc") ? {
  docId: params.get("evidenceDoc")!, generation: params.get("evidenceGeneration")!,
} : undefined)
if (initialIncomplete) continuity?.missing(new Uint8Array([0, 0]))

function Editor() {
  const editor = useCreateBlockNote({
    schema: blockNoteSchema,
    ...(capture ? { extensions: [capture.extension] } : continuity ? { extensions: [continuity.extension] } : {}),
    collaboration: {
      fragment: ydoc.getXmlFragment("prosemirror"),
      provider: { awareness },
      user: awareness.getLocalState()!.user,
      showCursorLabels: "always",
    },
  }, [ydoc, awareness])

  useEffect(() => {
    mounts++
    const initialView = editor.prosemirrorView
    const initialDOM = initialView.dom
    const initialAwareness = awareness
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const removed of record.removedNodes) {
          if (removed === initialDOM || removed.contains(initialDOM)) detachments++
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const setSelection = (blockId: string, fromOffset: number, toOffset = fromOffset) => {
      const view = editor.prosemirrorView
      let start: number | undefined
      let size = 0
      view.state.doc.descendants((node, pos) => {
        if (node.type.name !== "blockContainer" || node.attrs.id !== blockId) return
        if (!node.firstChild?.isTextblock) throw new Error(`Block ${blockId} is not a direct textblock`)
        start = pos + 2
        size = node.firstChild.content.size
        return false
      })
      if (start === undefined) throw new Error(`Block ${blockId} not found`)
      if (![fromOffset, toOffset].every(offset => Number.isInteger(offset) && offset >= 0 && offset <= size)) {
        throw new Error(`Offsets must be integers from 0 to ${size}`)
      }
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start + fromOffset, start + toOffset)))
      view.focus()
    }
    window.harness = {
      placeCursor(blockId: string) {
        editor.setTextCursorPosition(blockId, "end")
        editor.focus()
        window.scrollTo(0, 240)
      },
      placeCursorAt(blockId: string, offset: number) { setSelection(blockId, offset) },
      setSelection,
      replaceSelection(text: string) {
        const view = editor.prosemirrorView
        view.dispatch(view.state.tr.insertText(text))
      },
      transientTextEdit(padding: number) {
        if (!continuity || !Number.isInteger(padding) || padding < 0 || padding > 8 * 1024 * 1024) throw new Error("Invalid continuity byte-budget fixture")
        const view = editor.prosemirrorView
        const at = view.state.selection.from
        view.dispatch(view.state.tr.insertText("x".repeat(padding), at).delete(at, at + padding).insertText("!", at))
      },
      performUndo() { return undo(editor.prosemirrorView.state) },
      performRedo() { return redo(editor.prosemirrorView.state) },
      probeCapture() { return capture?.probe() ?? { enabled: false as const } },
      probeContinuity() { return continuity?.probe() ?? { enabled: false as const } },
      synchronizeEvidence(input: unknown, requestId: string) {
        if (!continuity) throw new Error("Continuity mode is disabled")
        return continuity.synchronize(input, requestId)
      },
      retryLastContinuityPacket() {
        if (!continuity) throw new Error("Continuity mode is disabled")
        continuity.retryLastPacket()
      },
      separateHistory() { (yUndoPluginKey.getState(editor.prosemirrorView.state)!.undoManager as Y.UndoManager).stopCapturing() },
      splitRejoin(blockId: string, offset: number, pairs = 1, enclosing = false) {
        if (!Number.isInteger(pairs) || pairs < 1 || pairs > 257) throw new Error("Invalid harness split count")
        setSelection(blockId, offset)
        const view = editor.prosemirrorView
        const at = view.state.selection.from
        const dispatch = () => {
          const tr = view.state.tr
          for (let i = 0; i < pairs; i++) tr.split(at, 2).join(at + 2, 2)
          view.dispatch(tr)
        }
        if (enclosing) ydoc.transact(dispatch, ySyncPluginKey)
        else dispatch()
      },
      probe() {
        const view = editor.prosemirrorView
        const native = window.getSelection()!
        return {
          blocks: editor.document,
          xml: ydoc.getXmlFragment("prosemirror").toJSON(),
          vector: Array.from(Y.encodeStateVector(ydoc)),
          pending: pending.size,
          syncs,
          agentUpdates,
          mounts,
          unmounts,
          detachments,
          socketOpen: socket.readyState === WebSocket.OPEN,
          sameView: view === initialView,
          sameDOM: view.dom === initialDOM && initialDOM.isConnected,
          sameDoc: ySyncPluginKey.getState(view.state)?.doc === ydoc,
          sameAwareness: awareness === initialAwareness,
          focused: view.hasFocus() && view.dom.contains(document.activeElement),
          selection: {
            from: view.state.selection.from,
            to: view.state.selection.to,
            blockId: editor.getTextCursorPosition().block.id,
            anchorOffset: native.anchorOffset,
            focusOffset: native.focusOffset,
            anchorText: native.anchorNode?.textContent,
            focusText: native.focusNode?.textContent,
            collapsed: native.isCollapsed,
          },
          scroll: { x: window.scrollX, y: window.scrollY, editor: view.dom.scrollTop },
        }
      },
    }
    return () => {
      unmounts++
      observer.disconnect()
      capture?.dispose()
      continuity?.dispose()
    }
  }, [editor])

  return <BlockNoteView editor={editor} theme="light" sideMenu={false} />
}

declare global {
  interface Window {
    harness: {
      placeCursor(blockId: string): void
      placeCursorAt(blockId: string, offset: number): void
      setSelection(blockId: string, fromOffset: number, toOffset?: number): void
      replaceSelection(text: string): void
      transientTextEdit(padding: number): void
      performUndo(): boolean
      performRedo(): boolean
      probeCapture(): ReturnType<NonNullable<typeof capture>["probe"]> | { enabled: false }
      probeContinuity(): ReturnType<NonNullable<typeof continuity>["probe"]> | { enabled: false }
      synchronizeEvidence(input: unknown, requestId: string): ReturnType<NonNullable<typeof continuity>["synchronize"]>
      retryLastContinuityPacket(): void
      separateHistory(): void
      splitRejoin(blockId: string, offset: number, pairs?: number, enclosing?: boolean): void
      probe(): any
    }
  }
}

createRoot(document.getElementById("root")!).render(<Editor />)
