import { createExtension } from "@blocknote/core"
import type { Node } from "prosemirror-model"
import { Plugin, PluginKey, type Transaction } from "prosemirror-state"
import { ySyncPluginKey, yUndoPluginKey } from "y-prosemirror"
import * as Y from "yjs"

const RECORD_KEY = "__experiment_structural_capture"
const MAX_RECORDS = 32
const MAX_BYTES = 64 * 1024
const MAX_OBSERVATIONS = 128
const MAX_BATCH_TRANSACTIONS = 128
const MAX_BATCH_STEPS = 512

type Batch = { root: Transaction; transactions: Transaction[]; steps: number; overflow: boolean }
type Origin = "y-sync" | "undo" | "redo" | "undo-manager" | "relay" | "other"
type Structure = { blocks: number; textblocks: number; blockGroups: number }
type CaptureRecord = {
  id: string
  writer: number
  preSnapshot: number[]
  snapshotMatchesTransactionBeforeState: boolean
  before: Structure
  after: Structure
  docEqual: boolean
  transactions: { appended: boolean; docChanged: boolean; addToHistory: boolean; steps: unknown[] }[]
}
type Evidence = {
  origin: Origin
  observedBefore: boolean
  fragmentChanged: boolean
  recordsAdded: number
  captureId: string | null
  captureObserved: boolean
  undoBefore?: Node
}
type UpdateObservation = {
  index: number
  local: boolean
  origin: Origin
  bytes: number
  observedBefore: boolean
  fragmentChanged: boolean
  recordsAdded: number
  captureId: string | null
  captureObserved: boolean
  contentAndCaptureSameTransaction: boolean
}
type UndoObservation = {
  origin: Origin
  before: Structure
  after: Structure
  pmDocEqual: boolean
  fragmentChanged: boolean
  recordsAdded: number
  contentChangedWithoutCapture: boolean
}

function structure(doc: Node): Structure {
  const counts = { blocks: 0, textblocks: 0, blockGroups: 0 }
  doc.descendants(node => {
    if (node.type.name === "blockContainer") counts.blocks++
    if (node.type.name === "blockGroup") counts.blockGroups++
    if (node.isTextblock) counts.textblocks++
  })
  return counts
}

// Harness evidence only. No span safety decisions, command classification, or resolver callers.
export function createStructuralCapture(ydoc: Y.Doc) {
  const fragment = ydoc.getXmlFragment("prosemirror")
  const records = ydoc.getArray<CaptureRecord>(RECORD_KEY)
  const key = new PluginKey<Batch | null>("experimentStructuralCapture")
  const flushed = new WeakSet<Transaction>()
  const evidence = new WeakMap<Y.Transaction, Evidence>()
  const updates: UpdateObservation[] = []
  const undoObservations: UndoObservation[] = []
  const errors: string[] = []
  const encoder = new TextEncoder()
  let detach = () => {}
  let mounted = false
  let stopped = false
  let limitsExceeded = false
  let incomplete = false
  let diagnosticBytes = 0
  let sequence = 0
  let localRecordsWritten = 0
  let localUpdateCount = 0
  let remoteUpdateCount = 0
  let ordinaryContentUpdates = 0
  let ordinaryAtomicUpdates = 0
  let ordinaryMissingCaptureUpdates = 0
  let captureWithoutContentUpdates = 0
  let undoChangedWithoutCapture = 0

  function fail(message: string, stop = true, limit = false) {
    incomplete = true
    stopped ||= stop
    limitsExceeded ||= limit
    const text = message.slice(0, 240)
    if (errors.length < 8 && !errors.includes(text)) errors.push(text)
  }

  function guard(stage: string, run: () => void) {
    try { run() } catch (error) { fail(`${stage}: ${String(error)}`) }
  }

  function observe<T>(list: T[], item: T) {
    const bytes = encoder.encode(JSON.stringify(item)).byteLength
    if (list.length >= MAX_OBSERVATIONS || diagnosticBytes + bytes > MAX_BYTES) {
      fail("Local diagnostic observation budget exceeded", true, true)
      return
    }
    diagnosticBytes += bytes
    list.push(item)
  }

  function readRecords() {
    // Admission is local to the currently integrated shared array. Concurrent
    // peers can overshoot it; report/truncate rather than deleting their evidence.
    const result: CaptureRecord[] = []
    let bytes = 2 // JSON array delimiters; count record separators below.
    for (let index = 0; index < Math.min(records.length, MAX_RECORDS); index++) {
      const record = records.get(index)
      const size = encoder.encode(JSON.stringify(record)).byteLength + (index ? 1 : 0)
      if (bytes + size > MAX_BYTES) {
        fail("Shared capture byte budget exceeded", true, true)
        return { records: result, bytes, truncated: true }
      }
      bytes += size
      result.push(record)
    }
    const truncated = records.length > MAX_RECORDS
    if (truncated) fail("Shared capture record budget exceeded", true, true)
    return { records: result, bytes, truncated }
  }

  const extension = createExtension({
    key: "experimentStructuralCapture",
    runsBefore: ["ySync"],
    prosemirrorPlugins: [new Plugin<Batch | null>({
      key,
      state: {
        init: () => null,
        apply(tr, previous) {
          if (stopped) return null
          const root = (tr.getMeta("appendedTransaction") as Transaction | undefined) ?? tr
          // Appended normalization often has no ySync metadata of its own.
          if (root.getMeta(ySyncPluginKey) !== undefined || tr.getMeta(ySyncPluginKey) !== undefined) return null
          const batch = previous?.root === root ? previous : null
          if (batch?.overflow) return batch
          const steps = (batch?.steps ?? 0) + tr.steps.length
          if ((batch?.transactions.length ?? 0) >= MAX_BATCH_TRANSACTIONS || steps > MAX_BATCH_STEPS) {
            return { root, transactions: [], steps, overflow: true }
          }
          return { root, transactions: [...(batch?.transactions ?? []), tr], steps, overflow: false }
        },
      },
      view(view) {
        mounted = true
        const originOf = (tr: Y.Transaction): Origin => {
          const um = yUndoPluginKey.getState(view.state)?.undoManager
          if (um && tr.origin === um) return um.undoing ? "undo" : um.redoing ? "redo" : "undo-manager"
          if (tr.origin === ySyncPluginKey) return "y-sync"
          return tr.origin === "relay" ? "relay" : "other"
        }
        const getEvidence = (tr: Y.Transaction) => {
          let item = evidence.get(tr)
          if (!item) {
            item = { origin: originOf(tr), observedBefore: false, fragmentChanged: false, recordsAdded: 0, captureId: null, captureObserved: false }
            evidence.set(tr, item)
          }
          return item
        }
        const beforeTransaction = (yt: Y.Transaction) => guard("beforeTransaction", () => {
          const item = getEvidence(yt)
          item.observedBefore = true
          if (yt.local && (item.origin === "undo" || item.origin === "redo")) {
            // Read-only observation: undo mutates Y before its PM transaction exists.
            item.undoBefore = view.state.doc
          }
          if (stopped || !yt.local || yt.origin !== ySyncPluginKey) return
          const batch = key.getState(view.state)
          const sync = ySyncPluginKey.getState(view.state)
          if (!batch || flushed.has(batch.root)) return
          if (batch.overflow) {
            fail("Accepted PM batch budget exceeded", true, true)
            return
          }
          if (!batch.transactions.some(tr => tr.docChanged)) return
          if (!sync || sync.doc !== ydoc || sync.type !== fragment || sync.snapshot != null || sync.prevSnapshot != null) {
            fail("Capture attempted outside the live collaboration binding")
            return
          }
          flushed.add(batch.root)
          const current = readRecords()
          if (stopped) return
          if (records.length >= MAX_RECORDS) {
            fail("Shared capture record budget exhausted", true, true)
            return
          }
          // The installed PM state is final, but the Y fragment is still pre-batch.
          // This must precede our own write as well as ySync's transaction body.
          const snapshot = Y.snapshot(ydoc)
          const snapshotMatchesTransactionBeforeState = snapshot.sv.size === yt.beforeState.size &&
            [...snapshot.sv].every(([client, clock]) => yt.beforeState.get(client) === clock)
          if (!snapshotMatchesTransactionBeforeState) {
            fail("Y state changed before the prechange snapshot was captured")
            return
          }
          const record: CaptureRecord = {
            id: `${ydoc.clientID}:${++sequence}`,
            writer: ydoc.clientID,
            preSnapshot: Array.from(Y.encodeSnapshot(snapshot)),
            snapshotMatchesTransactionBeforeState,
            before: structure(batch.root.before),
            after: structure(view.state.doc),
            docEqual: batch.root.before.eq(view.state.doc),
            transactions: batch.transactions.map(tr => ({
              appended: tr.getMeta("appendedTransaction") !== undefined,
              docChanged: tr.docChanged,
              addToHistory: tr.getMeta("addToHistory") !== false,
              steps: tr.steps.map(step => step.toJSON()),
            })),
          }
          const bytes = encoder.encode(JSON.stringify(record)).byteLength + (records.length ? 1 : 0)
          if (current.bytes + bytes > MAX_BYTES) {
            fail("Shared capture byte budget exhausted", true, true)
            return
          }
          item.captureId = record.id
          records.push([record])
          localRecordsWritten++
        })
        const fragmentChanged = (_events: Y.YEvent<any>[], yt: Y.Transaction) => guard("fragment observer", () => {
          getEvidence(yt).fragmentChanged = true
        })
        const recordsChanged = (event: Y.YArrayEvent<CaptureRecord>, yt: Y.Transaction) => guard("capture observer", () => {
          const item = getEvidence(yt)
          for (const delta of event.changes.delta) {
            if (!Array.isArray(delta.insert)) continue
            item.recordsAdded += delta.insert.length
            if (delta.insert.some((record: CaptureRecord) => record.id === item.captureId)) item.captureObserved = true
          }
          readRecords()
        })
        const afterTransaction = (yt: Y.Transaction) => guard("afterTransaction", () => {
          const item = getEvidence(yt)
          if (!item.undoBefore) return
          const contentChangedWithoutCapture = item.fragmentChanged && item.recordsAdded === 0
          if (contentChangedWithoutCapture) undoChangedWithoutCapture++
          observe(undoObservations, {
            origin: item.origin,
            before: structure(item.undoBefore),
            after: structure(view.state.doc),
            pmDocEqual: item.undoBefore.eq(view.state.doc),
            fragmentChanged: item.fragmentChanged,
            recordsAdded: item.recordsAdded,
            contentChangedWithoutCapture,
          })
          delete item.undoBefore
        })
        const update = (bytes: Uint8Array, _origin: unknown, _doc: Y.Doc, yt: Y.Transaction) => guard("update", () => {
          if (yt.local) localUpdateCount++
          else remoteUpdateCount++
          const item = getEvidence(yt)
          const atomic = item.fragmentChanged && item.captureObserved && item.observedBefore
          if (yt.local && item.origin === "y-sync" && item.fragmentChanged) {
            ordinaryContentUpdates++
            if (atomic) ordinaryAtomicUpdates++
            else {
              ordinaryMissingCaptureUpdates++
              fail("Local ySync content update has no same-transaction capture", false)
            }
          }
          if (item.captureId && !item.fragmentChanged) {
            captureWithoutContentUpdates++
            fail("Capture update has no fragment change (including possible net-zero PM batch)", false)
          }
          observe(updates, {
            index: localUpdateCount + remoteUpdateCount,
            local: yt.local,
            origin: item.origin,
            bytes: bytes.byteLength,
            observedBefore: item.observedBefore,
            fragmentChanged: item.fragmentChanged,
            recordsAdded: item.recordsAdded,
            captureId: item.captureId,
            captureObserved: item.captureObserved,
            contentAndCaptureSameTransaction: atomic,
          })
        })
        ydoc.on("beforeTransaction", beforeTransaction)
        fragment.observeDeep(fragmentChanged)
        records.observe(recordsChanged)
        ydoc.on("afterTransaction", afterTransaction)
        ydoc.on("update", update)
        let attached = true
        const destroy = () => {
          if (!attached) return
          attached = false
          mounted = false
          ydoc.off("beforeTransaction", beforeTransaction)
          fragment.unobserveDeep(fragmentChanged)
          records.unobserve(recordsChanged)
          ydoc.off("afterTransaction", afterTransaction)
          ydoc.off("update", update)
        }
        detach = destroy
        return { destroy }
      },
    })],
  })

  return {
    extension,
    dispose() { detach() },
    probe() {
      const shared = readRecords()
      return structuredClone({
        enabled: true as const,
        experimentOnly: true,
        safeSpanSupport: false,
        recordKey: RECORD_KEY,
        limits: {
          records: MAX_RECORDS,
          recordBytes: MAX_BYTES,
          observationsPerList: MAX_OBSERVATIONS,
          diagnosticBytes: MAX_BYTES,
          batchTransactions: MAX_BATCH_TRANSACTIONS,
          batchSteps: MAX_BATCH_STEPS,
          scope: "local-admission-and-bounded-probe; concurrent-shared-overshoot-detected",
        },
        mounted,
        stopped,
        limitsExceeded,
        coverage: incomplete ? "incomplete" : "observing",
        atomicScope: "ordinary-local-pm-batches-only",
        atomicStatus: incomplete ? "incomplete" : ordinaryAtomicUpdates ? "observed-same-transaction" : "unobserved",
        records: shared.records,
        recordCount: records.length,
        recordBytes: shared.bytes,
        recordsTruncated: shared.truncated,
        diagnosticBytes,
        localRecordsWritten,
        localUpdateCount,
        remoteUpdateCount,
        ordinaryContentUpdates,
        ordinaryAtomicUpdates,
        ordinaryMissingCaptureUpdates,
        captureWithoutContentUpdates,
        updates,
        undo: { status: "unresolved", changedWithoutCapture: undoChangedWithoutCapture, observations: undoObservations },
        errors,
      })
    },
  }
}
