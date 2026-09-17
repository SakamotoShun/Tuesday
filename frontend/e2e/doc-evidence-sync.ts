import * as Y from "yjs"
import { evidencePacketSchema, parseDocEvidenceSync, type DocEvidenceSync } from "../../backend/src/collab/docEvidenceSyncProtocol"
import type { ContinuityPacket } from "./doc-continuity-bridge"

export type EvidenceSyncIdentity = { docId: string; generation: string }
export type EvidenceSyncCursor = { epoch: string; baseline: string; collabSeq: number; serverIds: string[] }
const encode = (bytes: Uint8Array) => {
  let text = ""
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
const decode = (text: string) => {
  const bytes = Uint8Array.from(atob(text), char => char.charCodeAt(0))
  if (encode(bytes) !== text) throw new Error("Noncanonical evidence encoding")
  return bytes
}
function materialize(baseline: string, packets: ContinuityPacket[]) {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, decode(baseline))
    for (const packet of packets) Y.applyUpdate(doc, decode(packet.update))
    // Same dependency check as the server materializer; never certify a prefix.
    if (doc.store.pendingStructs || doc.store.pendingDs) throw new Error("Unresolved evidence content")
    return doc
  } catch (error) { doc.destroy(); throw error }
}
function canonical(state: string) {
  const doc = materialize(state, [])
  try { return encode(Y.encodeStateAsUpdate(doc)) } finally { doc.destroy() }
}
function closure(ids: Iterable<string>, packets: Map<string, ContinuityPacket>) {
  const ordered = new Map<string, ContinuityPacket>(), visiting = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Cyclic evidence ancestry")
    if (ordered.has(id)) return
    const packet = packets.get(id)
    if (!packet) throw new Error("Missing retained evidence source")
    visiting.add(id)
    packet.parents.forEach(visit)
    visiting.delete(id)
    ordered.set(id, packet)
  }
  for (const id of ids) visit(id)
  return [...ordered.values()]
}
function frontier(packets: Map<string, ContinuityPacket>) {
  const heads = new Set(packets.keys())
  for (const packet of packets.values()) for (const parent of packet.parents) heads.delete(parent)
  return [...heads].sort()
}

/** Prepare on disposable documents. The caller commits metadata before applying
 * the snapshot to its mounted Y.Doc, keeping native undo stack objects intact. */
export function prepareEvidenceSync(input: unknown, identity: EvidenceSyncIdentity, requestId: string,
  current: Y.Doc, retained: Iterable<ContinuityPacket>, cursor: EvidenceSyncCursor | null, maxPackets: number) {
  const envelope: DocEvidenceSync = parseDocEvidenceSync(input)
  if (envelope.docId !== identity.docId || envelope.generation !== identity.generation || envelope.requestId !== requestId) {
    throw new Error("Evidence sync identity mismatch")
  }
  if (!envelope.journal) {
    if (cursor) throw new Error("Previously active evidence journal disappeared")
    return null
  }
  const { checkpoint, frontier: serverFrontier } = envelope.journal
  if (cursor && (cursor.epoch !== checkpoint.epoch || cursor.baseline !== checkpoint.baseline
    || envelope.collabSeq < cursor.collabSeq)) throw new Error("Evidence journal changed or moved backwards")
  if (checkpoint.coverage.status !== "complete") throw new Error("Evidence coverage is incomplete")
  const packets = new Map<string, ContinuityPacket>()
  for (const packet of checkpoint.packets) {
    if (packets.has(packet.id)) throw new Error("Duplicate evidence packet ID")
    packets.set(packet.id, packet)
  }
  if (cursor?.serverIds.some(id => !packets.has(id))) throw new Error("Server discarded retained undo evidence")
  const serverIds = [...packets.keys()]
  const server = materialize(checkpoint.baseline, closure(serverIds, packets))
  try {
    if (JSON.stringify(frontier(packets)) !== JSON.stringify([...serverFrontier].sort())
      || encode(Y.encodeStateAsUpdate(server)) !== canonical(envelope.snapshot)) throw new Error("Evidence frontier does not cover durable content")
  } finally { server.destroy() }
  for (const inputPacket of retained) {
    const packet = evidencePacketSchema.parse(inputPacket)
    const existing = packets.get(packet.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(packet)) throw new Error("Contradictory retained packet")
    packets.set(packet.id, packet)
  }
  const ordered = closure(packets.keys(), packets)
  const heads = frontier(packets)
  const bytes = new TextEncoder().encode(JSON.stringify({ ...checkpoint, packets: ordered, coverage: { status: "complete" } })).length
  const baselineBytes = new TextEncoder().encode(checkpoint.baseline).length + 28 * 1024 + 1024
  const retainedBytes = ordered.reduce((total, packet) => total + new TextEncoder().encode(JSON.stringify(packet)).length, 0)
  if (packets.size > Math.min(maxPackets, checkpoint.limits.maxPackets) || heads.length > 32
    || Math.max(bytes + 28 * 1024, baselineBytes + retainedBytes) > checkpoint.limits.maxBytes) throw new Error("Evidence reconciliation budget exhausted")
  // Pending local packets keep their original parents/preimages. Do not rebase.
  for (const packet of ordered) {
    const before = materialize(checkpoint.baseline, closure(packet.parents, packets))
    try {
      if (encode(Y.encodeStateAsUpdate(before)) !== canonical(packet.before)) throw new Error("Evidence preimage does not match ancestry")
      if (packet.evidence.kind !== "pm" && packet.evidence.sourceId && !packets.has(packet.evidence.sourceId)) {
        throw new Error("Missing retained native-undo source")
      }
    } finally { before.destroy() }
  }
  const merged = materialize(checkpoint.baseline, ordered)
  const actual = materialize(encode(Y.encodeStateAsUpdate(current)), [])
  try {
    Y.applyUpdate(actual, decode(envelope.snapshot))
    if (actual.store.pendingStructs || actual.store.pendingDs
      || encode(Y.encodeStateAsUpdate(merged)) !== encode(Y.encodeStateAsUpdate(actual))) {
      throw new Error("Local content has no complete evidence coverage")
    }
  } finally { merged.destroy(); actual.destroy() }
  return { snapshot: decode(envelope.snapshot), packets: ordered, heads, baselineBytes,
    cursor: { epoch: checkpoint.epoch, baseline: checkpoint.baseline, collabSeq: envelope.collabSeq, serverIds } }
}
