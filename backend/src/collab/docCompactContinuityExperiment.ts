import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import * as Y from 'yjs';
import { z } from 'zod';
import {
  ContinuityError, ContinuityJournal, type ContinuityCheckpoint, type ContinuityDecision,
  type ContinuityOptions, type ContinuityPacket, type ContinuityReference,
} from './docContinuityExperiment';
import { decodeStrictBase64, materializeDocHistory, MAX_DOC_SYNC_PAYLOAD_BYTES, MAX_DOC_UPDATE_BYTES } from './docHistory';

// Local serial storage experiment, NOT a second resolver or production protocol.
// Keep editor evidence and original Yjs identities; reconstruct the oracle when
// needed. No issued-reference registry, final-text inference or new semantic IDs.
const MAX_RETAINED_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const COVERAGE_RESERVE_BYTES = 1536;
const key = z.string().min(1).max(128);
const integer = z.number().int().nonnegative().safe();
const checkpointSchema = z.object({
  version: z.literal(1), epoch: key,
  limits: z.object({ ttlMs: integer.positive().max(900_000), maxPackets: integer.positive().max(32),
    maxBytes: integer.positive().max(MAX_RETAINED_BYTES) }).strict(),
  observedAt: integer,
  floor: z.object({ sequence: integer, head: key.nullable(), state: z.string().min(1) }).strict(),
  records: z.array(z.object({ sequence: integer.positive(), admittedAt: integer, id: key,
    update: z.string().min(1), evidence: z.unknown() }).strict()).max(32),
  incomplete: z.string().min(1).max(240).nullable(),
}).strict();

interface CompactRecord {
  sequence: number;
  admittedAt: number;
  id: string;
  update: string;
  evidence: ContinuityPacket['evidence'];
}
export interface CompactContinuityCheckpoint extends Omit<z.infer<typeof checkpointSchema>, 'records'> {
  records: CompactRecord[];
}
export interface CompactContinuityReference extends Omit<ContinuityReference, 'issuedCut'> {
  sequence: number;
}
const bytes = (value: Uint8Array) => Buffer.from(value).toString('base64');
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
function invalid(message: string): never { throw new ContinuityError('INVALID_PACKET', message); }
function unknown(message: string): never { throw new ContinuityError('UNKNOWN', message); }
function limit(message: string): never { throw new ContinuityError('LIMIT_EXCEEDED', message); }
const lastSequence = (value: CompactContinuityCheckpoint) => value.records.at(-1)?.sequence ?? value.floor.sequence;
const head = (value: CompactContinuityCheckpoint) => value.records.at(-1)?.id ?? value.floor.head;
const parents = (value: CompactContinuityCheckpoint) => head(value) === null ? [] : [head(value)!];

function checkBudget(value: CompactContinuityCheckpoint) {
  if (value.records.length > value.limits.maxPackets
    || size({ ...value, incomplete: null }) + COVERAGE_RESERVE_BYTES > value.limits.maxBytes) {
    limit('Compact retention budget exhausted; live evidence was not evicted');
  }
}

/** Only serialized storage is compact. This disposable expansion still costs CPU/memory. */
function expand(value: CompactContinuityCheckpoint): ContinuityCheckpoint {
  const packets: ContinuityPacket[] = [];
  let doc = materializeDocHistory(decodeStrictBase64(value.floor.state, MAX_DOC_SYNC_PAYLOAD_BYTES), []);
  try {
    for (const record of value.records) {
      packets.push({ id: record.id, parents: packets.length ? [packets.at(-1)!.id] : [],
        before: bytes(Y.encodeStateAsUpdate(doc)), update: record.update, evidence: record.evidence });
      const next = materializeDocHistory(Y.encodeStateAsUpdate(doc), [decodeStrictBase64(record.update, MAX_DOC_UPDATE_BYTES)]);
      doc.destroy();
      doc = next;
    }
  } finally { doc.destroy(); }
  const expandedBytes = size([value.floor.state, packets]);
  if (expandedBytes > MAX_EXPANDED_BYTES) limit('Reconstructed evidence exceeds the experiment budget');
  return { version: 1, epoch: value.epoch, baseline: value.floor.state,
    limits: { ttlMs: value.limits.ttlMs, maxPackets: 32, maxBytes: MAX_EXPANDED_BYTES }, packets,
    coverage: value.incomplete === null ? { status: 'complete' }
      : { status: 'incomplete', reason: value.incomplete, knownCut: packets.length ? [packets.at(-1)!.id] : [] } };
}

export class CompactContinuityJournal {
  private value: CompactContinuityCheckpoint;
  private readonly now: () => number;

  constructor(baseline: Uint8Array | string, options: ContinuityOptions = {}) {
    this.now = options.now ?? Date.now;
    const observedAt = this.now();
    const candidate = { version: 1, epoch: randomUUID(), observedAt,
      limits: { ttlMs: options.ttlMs ?? 900_000, maxPackets: options.maxPackets ?? 32,
        maxBytes: options.maxBytes ?? MAX_RETAINED_BYTES },
      floor: { sequence: 0, head: null, state: typeof baseline === 'string' ? baseline : bytes(baseline) },
      records: [], incomplete: null };
    const parsed = checkpointSchema.safeParse(candidate);
    if (!parsed.success) invalid('Invalid compact journal configuration');
    this.value = parsed.data as CompactContinuityCheckpoint;
    checkBudget(this.value);
    this.oracle(this.value, observedAt);
  }

  private time(): number {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < this.value.observedAt) unknown('Clock moved behind the retained watermark');
    return now;
  }

  private oracle(value: CompactContinuityCheckpoint, now: number) {
    return ContinuityJournal.fromCheckpoint(expand(value), { now: () => now });
  }

  private pruned(now: number): CompactContinuityCheckpoint {
    const next = this.checkpoint();
    next.observedAt = now;
    // A gap cannot be healed by waiting for expiry or dropping its known prefix.
    if (next.incomplete !== null) return next;
    while (next.records[0] && next.records[0].admittedAt < now - next.limits.ttlMs) {
      const record = next.records.shift()!;
      const doc = materializeDocHistory(decodeStrictBase64(next.floor.state, MAX_DOC_SYNC_PAYLOAD_BYTES),
        [decodeStrictBase64(record.update, MAX_DOC_UPDATE_BYTES)]);
      try { next.floor = { sequence: record.sequence, head: record.id, state: bytes(Y.encodeStateAsUpdate(doc)) }; }
      finally { doc.destroy(); }
    }
    return next;
  }

  compact(): { reclaimed: number; retainedBytes: number } {
    const next = this.pruned(this.time());
    checkBudget(next);
    const reclaimed = next.floor.sequence - this.value.floor.sequence;
    this.value = next;
    return { reclaimed, retainedBytes: size(next) };
  }

  heads(): string[] { return parents(this.value); }
  currentState(): Uint8Array {
    const doc = materializeDocHistory(decodeStrictBase64(this.value.floor.state, MAX_DOC_SYNC_PAYLOAD_BYTES),
      this.value.records.map(record => decodeStrictBase64(record.update, MAX_DOC_UPDATE_BYTES)));
    try { return Y.encodeStateAsUpdate(doc); } finally { doc.destroy(); }
  }

  accept(input: ContinuityPacket): { status: 'accepted' | 'duplicate' } {
    const now = this.time();
    if (this.value.incomplete !== null) unknown('Coverage incomplete');
    // Bound the incoming envelope separately from retained storage. Producers are
    // trusted local fixtures; this is not a hostile-input transport decoder.
    if (size(input) > MAX_RETAINED_BYTES) limit('Incoming evidence exceeds the experiment budget');
    const packet = structuredClone(input);
    const duplicateIndex = this.value.records.findIndex(record => record.id === packet.id);
    if (duplicateIndex >= 0) {
      const expected = expand(this.value).packets[duplicateIndex]!;
      if (duplicateIndex === 0) expected.parents = this.value.floor.head === null ? [] : [this.value.floor.head];
      if (!isDeepStrictEqual(expected, packet)) invalid('Contradictory duplicate packet');
      return { status: 'duplicate' };
    }
    if (!isDeepStrictEqual(packet.parents, this.heads()) || packet.id === this.value.floor.head) {
      unknown('Only the current serial frontier is supported; stale or concurrent evidence was not admitted');
    }
    if (packet.before !== bytes(this.currentState())) invalid('Preimage is not the canonical current history');
    const next = this.pruned(now);
    if (next.records.length >= next.limits.maxPackets) limit('Compact packet budget exhausted; live evidence was not evicted');
    const oracle = this.oracle(next, now);
    // The floor is already in the binary baseline, not a retained DAG event.
    oracle.accept({ ...packet, parents: oracle.heads() });
    const validated = oracle.checkpoint().packets.at(-1)!;
    next.records.push({ sequence: lastSequence(next) + 1, admittedAt: now, id: validated.id,
      update: validated.update, evidence: validated.evidence });
    if (!Number.isSafeInteger(lastSequence(next))) limit('Sequence space exhausted');
    checkBudget(next);
    this.value = next;
    return { status: 'accepted' };
  }

  issueSpan(blockId: string, from: number, to: number, inlineIndex = 0): CompactContinuityReference {
    const now = this.time();
    const { issuedCut: _cut, ...ref } = this.oracle(this.value, now).issueSpan(blockId, from, to, inlineIndex);
    const next = { ...this.value, observedAt: now };
    checkBudget(next);
    this.value = next;
    return { ...ref, sequence: lastSequence(this.value) };
  }

  private reference(ref: CompactContinuityReference): ContinuityReference {
    if (!Number.isSafeInteger(ref.sequence) || ref.sequence < this.value.floor.sequence) unknown('Issuance cursor is no longer retained');
    const event = this.value.records.find(record => record.sequence === ref.sequence);
    if (!event && ref.sequence !== this.value.floor.sequence) unknown('Unknown issuance cursor');
    const { sequence: _sequence, ...rest } = ref;
    return { ...rest, issuedCut: event ? [event.id] : [] };
  }

  evaluate(ref: CompactContinuityReference, currentState?: string | Uint8Array): ContinuityDecision {
    try {
      const now = this.time();
      if (ref.epoch !== this.value.epoch || !Number.isSafeInteger(ref.issuedAt) || ref.issuedAt > now
        || ref.expiresAt !== ref.issuedAt + this.value.limits.ttlMs) unknown('Invalid issuance epoch or time');
      if (now >= ref.expiresAt) return { status: 'expired', reason: 'Reference lifetime elapsed' };
      return this.oracle(this.value, now).evaluate(this.reference(ref), currentState);
    } catch (error) { return { status: 'unknown', reason: String(error) }; }
  }

  apply(ref: CompactContinuityReference, text: string, currentState?: string | Uint8Array) {
    const decision = this.evaluate(ref, currentState);
    if (decision.status !== 'safe') unknown(`Patch refused: ${decision.status}: ${decision.reason}`);
    const oracle = this.oracle(this.value, this.time());
    const result = oracle.apply(this.reference(ref), text, currentState);
    const packet = { ...result.packet, parents: this.heads() };
    this.accept(packet);
    return { ...result, packet };
  }

  markIncomplete(reason: string): void {
    if (this.value.incomplete !== null) return;
    // Reserve control-state space even when the regular byte budget is full.
    this.value.incomplete = reason.slice(0, 240).replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || 'Unspecified coverage loss';
  }

  checkpoint(): CompactContinuityCheckpoint { return structuredClone(this.value); }

  static fromCheckpoint(input: CompactContinuityCheckpoint, options: Pick<ContinuityOptions, 'now'> = {}) {
    const parsed = checkpointSchema.safeParse(input);
    if (!parsed.success) invalid('Invalid compact checkpoint');
    const value = parsed.data as CompactContinuityCheckpoint;
    if ((value.floor.sequence === 0) !== (value.floor.head === null)) invalid('Invalid floor identity');
    const ids = new Set<string>(value.floor.head === null ? [] : [value.floor.head]);
    let sequence = value.floor.sequence, time = 0;
    for (const record of value.records) {
      if (record.sequence !== ++sequence || record.admittedAt < time || record.admittedAt > value.observedAt || ids.has(record.id)) {
        invalid('Invalid compact event order');
      }
      time = record.admittedAt;
      ids.add(record.id);
    }
    checkBudget(value);
    const result = new CompactContinuityJournal(value.floor.state, { ...value.limits, ...options });
    result.value = structuredClone(value);
    result.oracle(value, result.time());
    return result;
  }
}
