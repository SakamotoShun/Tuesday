import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ySyncPluginKey, yUndoPluginKey } from 'y-prosemirror'
import * as Y from 'yjs'
import { BlockNoteEditor } from '../src/components/docs/block-note-editor'
import { ErrorBoundary } from '../src/components/common/error-boundary'

// Only redirect the transport. The production editor, hook, Yjs binding and
// error boundary all run unchanged against the runner's loopback relay.
const relay = new URLSearchParams(location.search).get('relay')!
const NativeWebSocket = window.WebSocket
const sockets: WebSocket[] = []
const sentTypes: string[] = []
window.WebSocket = class extends NativeWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(String(url).includes('/api/v1/collab/docs/') ? relay : url, protocols)
    sockets.push(this)
  }
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof data === 'string') sentTypes.push(JSON.parse(data).type)
    super.send(data)
  }
}

let rerender = () => {}
let originalView: any
let originalUndo: any
let destroys = 0
const pm = () => (window as any).ProseMirror
const undoManager = () => {
  const state = yUndoPluginKey.getState(pm().state)
  if (!state) throw new Error('Native undo plugin is not mounted')
  return state.undoManager
}
const canonicalBinary = () => {
  const copy = new Y.Doc()
  try {
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(ySyncPluginKey.getState(pm().state).doc))
    return Array.from(Y.encodeStateAsUpdate(copy))
  } finally { copy.destroy() }
}

;(window as any).reconnectTest = {
  rerender: () => rerender(),
  remember() {
    originalView = pm().view
    originalUndo = undoManager()
    const destroy = originalView.destroy.bind(originalView)
    originalView.destroy = () => { destroys += 1; destroy() }
  },
  stopCapturing: () => undoManager().stopCapturing(),
  reconnect: () => sockets.at(-1)?.close(),
  inspect: () => ({
    sameView: originalView === pm().view,
    sameUndo: originalUndo === undoManager(),
    destroys,
    connections: sockets.length,
    sentTypes: [...sentTypes],
    text: pm().state.doc.textContent,
    editable: pm().isEditable,
    focused: pm().view.hasFocus(),
    selection: { from: pm().state.selection.from, to: pm().state.selection.to },
    document: pm().state.doc.toJSON(),
    binary: canonicalBinary(),
    undoSize: undoManager().undoStack.length,
    redoSize: undoManager().redoStack.length,
  }),
}

function Harness() {
  const [revision, setRevision] = useState(0)
  rerender = () => setRevision(value => value + 1)
  return <main data-revision={revision} style={{ width: 800, margin: 40 }}>
    <button id="outside">Outside editor</button>
    <ErrorBoundary title="Editor unavailable" message="Editor crashed">
      <BlockNoteEditor docId={new URLSearchParams(location.search).get('docId') ?? "reconnect-regression"}
        initialContent={[]} editable={!new URLSearchParams(location.search).has('readonly')} />
    </ErrorBoundary>
  </main>
}

createRoot(document.getElementById('root')!).render(<Harness />)
