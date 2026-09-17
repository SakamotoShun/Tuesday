import { createExtension } from "@blocknote/core"
import type { Node } from "prosemirror-model"
import { Plugin, PluginKey, type Transaction } from "prosemirror-state"
import { Step, Transform } from "prosemirror-transform"
import { ySyncPluginKey, yUndoPluginKey, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror"
import * as Y from "yjs"
// Historical retained-evidence experiment; never imported by production editors.
import { hasCancelledInsertion } from "../../backend/src/collab/docUndoContinuityExperiment"
import { prepareEvidenceSync, type EvidenceSyncCursor, type EvidenceSyncIdentity } from "./doc-evidence-sync"

export type ContinuityPacket = {
  id: string
  parents: string[]
  before: string
  update: string
  evidence: { kind: "pm"; steps: unknown[] } | { kind: "undo" | "redo"; sourceId?: string; sourceSteps: unknown[] }
}
type Output = { type: "continuity"; packet: ContinuityPacket } | { type: "update"; update: number[]; missing: true; reason: string }
type Batch = { root: Transaction; transactions: Transaction[]; steps: number; docChanged: boolean; overflow: boolean }
type Source = { id: string; certified: boolean }
type StackItem = Y.UndoManager["undoStack"][number]
type Pending = {
  before: string; vector: Uint8Array; pm: Node; parents: string[]
  captureMs: number
  batch?: Batch; direction?: "undo" | "redo"; stack?: StackItem; grouped?: boolean
}
const MAX_PACKETS = 32
const MAX_BYTES = 8 * 1024 * 1024
const MAX_STEPS = 512
const encoder = new TextEncoder()
export function encodeContinuityBytes(bytes: Uint8Array): string {
  let text = ""
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
export const decodeContinuityBytes = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0))

// Transport-packet atomicity only. Neither evidence nor history lives in Yjs.
export function createContinuityBridge(doc: Y.Doc, initialHeads: string[], send: (message: Output) => void, maxPackets = MAX_PACKETS,
  syncIdentity?: EvidenceSyncIdentity) {
  if (![32, 64, 128].includes(maxPackets)) throw new Error("Invalid continuity capacity")
  const fragment = doc.getXmlFragment("prosemirror")
  const key = new PluginKey<Batch | null>("experimentContinuityBridge")
  const sourceKey = Symbol("continuitySource")
  const flushed = new WeakSet<Transaction>()
  const contexts = new WeakMap<Y.Transaction, Pending>()
  const contextsByChanges = new WeakMap<object, Pending>()
  const handled = new WeakSet<Y.Transaction>()
  const known = new Set(initialHeads)
  const heads = new Set(initialHeads)
  // One retained serialized copy includes pending remote packets in the same budget.
  const retained = new Map<string, string>()
  const waiting = new Set<string>()
  let retainedBytes = 0
  let inFlightBytes = 0
  let peakInFlightBytes = 0
  const captureMs: number[] = []
  let sequence = 0
  let lastSentId: string | undefined
  let localPackets = 0
  let remotePackets = 0
  let duplicates = 0
  let uncertifiedUndo = 0
  let missingUpdates = 0
  let incomplete = false
  let awaitingEvidence = Boolean(syncIdentity)
  let syncCursor: EvidenceSyncCursor | null = null
  let baselineBytes = 0
  let mounted = false
  let detach = () => {}
  const errors: string[] = []
  const drainUncertified = () => {
    if (!incomplete) return
    // Content delivery no longer waits for a certificate we know is missing.
    // Do not advance known/heads: Yjs dependencies are not trusted ancestry.
    for (const id of waiting) {
      const packet = JSON.parse(retained.get(id)!) as ContinuityPacket
      Y.applyUpdate(doc, decodeContinuityBytes(packet.update), "relay")
      waiting.delete(id)
      remotePackets++
    }
  }
  const fail = (reason: string) => {
    // Local failures can happen inside Yjs observers. Drain only after cleanup.
    if (!incomplete) queueMicrotask(drainUncertified)
    incomplete = true
    if (errors.length < 8 && !errors.includes(reason)) errors.push(reason.slice(0, 240))
  }
  const canonical = () => {
    const copy = new Y.Doc()
    try { Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); return encodeContinuityBytes(Y.encodeStateAsUpdate(copy)) }
    finally { copy.destroy() }
  }
  const advance = (packet: ContinuityPacket) => {
    if (packet.parents.length > 32 || [...heads].filter(id => !packet.parents.includes(id) && id !== packet.id).length + 1 > 32) {
      throw new Error("Continuity causal frontier budget exhausted")
    }
    known.add(packet.id)
    for (const parent of packet.parents) heads.delete(parent)
    heads.add(packet.id)
  }
  const retain = (packet: ContinuityPacket) => {
    const serialized = JSON.stringify(packet)
    const previous = retained.get(packet.id)
    if (previous !== undefined) {
      if (previous !== serialized) throw new Error("Contradictory continuity packet")
      duplicates++
      return false
    }
    const bytes = encoder.encode(serialized).length
    if (retained.size >= maxPackets || baselineBytes + retainedBytes + inFlightBytes + bytes > MAX_BYTES) throw new Error("Continuity bridge budget exhausted")
    retained.set(packet.id, serialized)
    retainedBytes += bytes
    return true
  }
  const missing = (update: Uint8Array, reason: string) => {
    fail(reason)
    missingUpdates++
    send({ type: "update", update: Array.from(update), missing: true, reason })
  }
  const extension = createExtension({
    key: "experimentContinuityBridge",
    runsBefore: ["ySync"],
    prosemirrorPlugins: [new Plugin<Batch | null>({
      key,
      state: {
        init: () => null,
        apply(tr, previous) {
          const root = (tr.getMeta("appendedTransaction") as Transaction | undefined) ?? tr
          if (root.getMeta(ySyncPluginKey) !== undefined || tr.getMeta(ySyncPluginKey) !== undefined) return null
          const batch = previous?.root === root ? previous : null
          const steps = Math.min(MAX_STEPS + 1, (batch?.steps ?? 0) + tr.steps.length)
          const overflow = Boolean(batch?.overflow || steps > MAX_STEPS || (batch?.transactions.length ?? 0) >= 128)
          // This state can be speculative. Keep an overflow marker, not a side effect.
          return { root, transactions: overflow ? [] : [...(batch?.transactions ?? []), tr], steps,
            docChanged: Boolean(batch?.docChanged || tr.docChanged), overflow }
        },
      },
      view(view) {
        mounted = true
        const um = yUndoPluginKey.getState(view.state)!.undoManager as Y.UndoManager
        const open = new Set<Y.Transaction>()
        const observed = new WeakSet<Transaction>()
        let installed: Batch | undefined
        let attached = true
        const unconsumed = (batch: Batch, reason: string) => {
          if (!attached || flushed.has(batch.root)) return
          flushed.add(batch.root)
          // Coverage is independent of content bytes, including when already incomplete.
          missing(new Uint8Array([0, 0]), reason)
        }
        const installedUpdate = () => {
          const batch = key.getState(view.state)
          if (installed && installed.root !== batch?.root) unconsumed(installed, "Installed PM batch was not captured")
          if (!batch?.docChanged || observed.has(batch.root)) return
          observed.add(batch.root)
          installed = batch
          if (awaitingEvidence) { flushed.add(batch.root); return }
          if (batch.overflow) unconsumed(batch, "Accepted PM batch budget exhausted")
          else if (incomplete) unconsumed(batch, "Installed PM batch is outside continuity coverage")
          else if (open.size) unconsumed(batch, "Enclosing Y transaction is outside continuity coverage")
          else {
            // ySync's view update runs next. It normally consumes the batch before
            // dispatch returns; the next installed update also checks synchronously.
            queueMicrotask(() => unconsumed(batch, "Installed PM batch was not captured"))
          }
        }
        const before = (yt: Y.Transaction) => {
          open.add(yt)
          if (!yt.local || yt.origin === "relay" || incomplete || awaitingEvidence) return
          const started = performance.now()
          const batch = installed
          const accepted = yt.origin === ySyncPluginKey && batch && !flushed.has(batch.root) && batch.docChanged && !batch.overflow ? batch : undefined
          try {
            const pre = canonical()
            if (baselineBytes + retainedBytes + inFlightBytes + pre.length > MAX_BYTES) throw new Error("Continuity preimage budget exhausted")
            const context: Pending = {
              before: pre, vector: Y.encodeStateVector(doc), parents: [...heads].sort(), captureMs: 0,
              pm: yXmlFragmentToProseMirrorRootNode(fragment, view.state.schema),
              batch: accepted,
              direction: yt.origin === um ? um.undoing ? "undo" : um.redoing ? "redo" : undefined : undefined,
            }
            contexts.set(yt, context)
            contextsByChanges.set(yt.changedParentTypes, context)
            inFlightBytes += pre.length
            peakInFlightBytes = Math.max(peakInFlightBytes, inFlightBytes)
            context.captureMs = performance.now() - started
            if (accepted) flushed.add(accepted.root)
          } catch (error) {
            if (accepted) unconsumed(accepted, String(error))
            else missing(new Uint8Array([0, 0]), String(error))
          }
        }
        const stack = (event: { stackItem: StackItem; origin: unknown; changedParentTypes: object }, grouped: boolean) => {
          const current = contextsByChanges.get(event.changedParentTypes)
          if (!current || (event.origin !== ySyncPluginKey && event.origin !== um)) return
          current.stack = event.stackItem
          current.grouped = grouped
          // A coalesced item is not a single source certificate.
          event.stackItem.meta.delete(sourceKey)
        }
        const added = (event: { stackItem: StackItem; origin: unknown; changedParentTypes: object }) => stack(event, false)
        const updated = (event: { stackItem: StackItem; origin: unknown; changedParentTypes: object }) => stack(event, true)
        const after = (yt: Y.Transaction) => {
          open.delete(yt)
          const context = contexts.get(yt)
          if (!context) return
          const started = performance.now()
          contexts.delete(yt)
          inFlightBytes -= context.before.length
          let unchanged = false
          try {
            const post = canonical()
            unchanged = context.before === post
            if (unchanged && !context.batch) { handled.add(yt); return }
            const afterPM = yXmlFragmentToProseMirrorRootNode(fragment, view.state.schema)
            const matches = (steps: unknown[]) => {
              let pm = context.pm
              for (const json of steps) { const result = Step.fromJSON(view.state.schema, json).apply(pm); if (!result.doc) return false; pm = result.doc }
              return pm.eq(afterPM)
            }
            let evidence: ContinuityPacket["evidence"]
            let certified = true
            if (context.direction) {
              const source = um.currStackItem?.meta.get(sourceKey) as Source | undefined
              const sourcePacket = source ? retained.get(source.id) : undefined
              let inverse: unknown[] | undefined
              if (source?.certified && sourcePacket) {
                const packet = JSON.parse(sourcePacket) as ContinuityPacket
                const pre = new Y.Doc()
                try {
                  Y.applyUpdate(pre, decodeContinuityBytes(packet.before))
                  let pm = yXmlFragmentToProseMirrorRootNode(pre.getXmlFragment("prosemirror"), view.state.schema)
                  const candidate: unknown[] = []
                  for (const json of packet.evidence.kind === "pm" ? packet.evidence.steps : packet.evidence.sourceSteps) {
                    const step = Step.fromJSON(view.state.schema, json)
                    candidate.unshift(step.invert(pm).toJSON())
                    pm = step.apply(pm).doc!
                  }
                  Y.applyUpdate(pre, decodeContinuityBytes(packet.update))
                  const sourcePost = Y.encodeStateAsUpdate(pre)
                  const compatible = encodeContinuityBytes(sourcePost) === context.before
                    || hasCancelledInsertion(Y, packet, sourcePost, context.before, context.parents, id => {
                      const saved = retained.get(id)
                      return saved && known.has(id) ? JSON.parse(saved) as ContinuityPacket : undefined
                    })
                  if (compatible && matches(candidate)) inverse = candidate
                } finally { pre.destroy() }
              }
              if (source && inverse) {
                evidence = { kind: context.direction, sourceId: source.id, sourceSteps: inverse }
              } else {
                certified = false
                uncertifiedUndo++
                evidence = { kind: context.direction, sourceSteps: new Transform(context.pm).replaceWith(0, context.pm.content.size, afterPM.content).steps.map(step => step.toJSON()) }
              }
            } else if (context.batch) {
              const steps = context.batch.transactions.flatMap(tr => tr.steps.map(step => step.toJSON()))
              if (!context.batch.root.before.eq(context.pm) || !matches(steps)) throw new Error("Accepted PM evidence does not match actual Y result")
              evidence = { kind: "pm", steps }
            } else throw new Error("Local Y mutation has no accepted PM provenance")
            const packet: ContinuityPacket = {
              id: `${doc.clientID}:${++sequence}`, parents: context.parents, before: context.before,
              update: encodeContinuityBytes(Y.encodeStateAsUpdate(doc, context.vector)), evidence,
            }
            if (incomplete) throw new Error("Continuity coverage is incomplete")
            if (!packet.parents.every(parent => known.has(parent))) throw new Error("Local packet has an unresolved causal parent")
            retain(packet)
            advance(packet)
            if (context.stack && !context.grouped) context.stack.meta.set(sourceKey, { id: packet.id, certified } satisfies Source)
            handled.add(yt)
            localPackets++
            lastSentId = packet.id
            // Synchronous transport finalization precedes any subsequent local edit.
            send({ type: "continuity", packet })
          } catch (error) {
            handled.add(yt)
            missing(unchanged ? new Uint8Array([0, 0]) : Y.encodeStateAsUpdate(doc, context.vector), String(error))
          } finally {
            if (captureMs.length < 256) captureMs.push(context.captureMs + performance.now() - started)
          }
        }
        const update = (bytes: Uint8Array, origin: unknown, _doc: Y.Doc, yt: Y.Transaction) => {
          if (awaitingEvidence) {
            if (yt.local && origin !== "relay") send({ type: "update", update: Array.from(bytes), missing: true, reason: "Evidence journal not initialised" })
            return
          }
          if (yt.local && origin !== "relay" && !handled.has(yt)) missing(bytes, "Local update is outside continuity coverage")
        }
        doc.on("beforeTransaction", before)
        doc.on("afterTransaction", after)
        doc.on("update", update)
        um.on("stack-item-added", added)
        um.on("stack-item-updated", updated)
        const destroy = () => {
          if (!attached) return
          attached = false
          mounted = false
          doc.off("beforeTransaction", before)
          doc.off("afterTransaction", after)
          doc.off("update", update)
          um.off("stack-item-added", added)
          um.off("stack-item-updated", updated)
        }
        detach = destroy
        return { update: installedUpdate, destroy }
      },
    })],
  })
  return {
    extension,
    synchronize(input: unknown, requestId: string) {
      if (!syncIdentity) throw new Error("Evidence sync identity was not configured")
      // Coverage loss is sticky, including across fresh sync responses.
      if (incomplete) return { status: "incomplete" as const }
      try {
        if (inFlightBytes) throw new Error("Evidence sync during an active editor transaction")
        const prepared = prepareEvidenceSync(input, syncIdentity, requestId, doc,
          [...retained.values()].map(value => JSON.parse(value) as ContinuityPacket), syncCursor, maxPackets)
        if (!prepared) return { status: "inactive" as const }
        retained.clear(); known.clear(); heads.clear(); waiting.clear()
        retainedBytes = 0
        for (const packet of prepared.packets) {
          const serialized = JSON.stringify(packet)
          retained.set(packet.id, serialized)
          retainedBytes += encoder.encode(serialized).length
          known.add(packet.id)
        }
        prepared.heads.forEach(id => heads.add(id))
        syncCursor = prepared.cursor
        // Reserve the baseline and control metadata as well as packet bytes.
        baselineBytes = prepared.baselineBytes
        awaitingEvidence = false
        Y.applyUpdate(doc, prepared.snapshot, "relay")
        return { status: "ready" as const }
      } catch (error) {
        fail(String(error))
        return { status: "incomplete" as const }
      }
    },
    retryLastPacket() {
      if (!lastSentId) throw new Error("No continuity packet to retry")
      send({ type: "continuity", packet: JSON.parse(retained.get(lastSentId)!) as ContinuityPacket })
    },
    receive(packet: ContinuityPacket) {
      try {
        if (!retain(packet)) { drainUncertified(); return }
        waiting.add(packet.id)
        if (incomplete) { drainUncertified(); return }
        let progressed = true
        while (progressed && !incomplete) {
          progressed = false
          for (const id of waiting) {
            const next = JSON.parse(retained.get(id)!) as ContinuityPacket
            if (!next.parents.every(parent => known.has(parent))) continue
            // Advance first: any synchronous PM normalization sees the causal frontier.
            advance(next)
            waiting.delete(id)
            Y.applyUpdate(doc, decodeContinuityBytes(next.update), "relay")
            remotePackets++
            progressed = true
          }
        }
        drainUncertified()
      } catch (error) {
        fail(String(error))
        Y.applyUpdate(doc, decodeContinuityBytes(packet.update), "relay")
        drainUncertified()
      }
    },
    missing(update: Uint8Array) {
      fail("Remote update is labelled missing provenance")
      Y.applyUpdate(doc, update, "relay")
      drainUncertified()
    },
    dispose() { detach() },
    probe() {
      return { enabled: true as const, experimentOnly: true, atomicScope: "transport-packet-not-y-transaction", mounted, incomplete, awaitingEvidence,
        localPackets, remotePackets, duplicates, uncertifiedUndo, missingUpdates, packetCount: retained.size,
        bytes: baselineBytes + retainedBytes + inFlightBytes, buffered: waiting.size, heads: [...heads].sort(), errors: [...errors],
        captureMs: [...captureMs], peakInFlightBytes,
        limits: { packets: maxPackets, bytes: MAX_BYTES, scope: "local-including-pending-not-production-quota" } }
    },
  }
}
