import { z } from 'zod';

// Browser-safe, opt-in protocol. Content sync keeps its existing 2 MiB bound;
// this separate response carries the existing bounded full-evidence checkpoint.
export const MAX_EVIDENCE_CHECKPOINT_BYTES = 8 * 1024 * 1024;
export const MAX_EVIDENCE_SYNC_BYTES = 12 * 1024 * 1024;
const key = z.string().min(1).max(128);
const ids = z.array(key).max(32).refine(value => new Set(value).size === value.length);
const encoded = (bytes: number) => z.string().min(1).max(Math.ceil(bytes / 3) * 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .refine(value => value.length % 4 === 0
    && value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) <= bytes);
export const evidencePacketSchema = z.object({
  id: key, parents: ids, before: encoded(2 * 1024 * 1024), update: encoded(1024 * 1024),
  evidence: z.union([
    z.object({ kind: z.literal('pm'), steps: z.array(z.unknown()).max(512) }).strict(),
    z.object({ kind: z.enum(['undo', 'redo']), sourceId: key.optional(), sourceSteps: z.array(z.unknown()).max(512) }).strict(),
  ]),
}).strict();
const checkpointSchema = z.object({
  version: z.literal(1), epoch: key, baseline: encoded(2 * 1024 * 1024),
  limits: z.object({ ttlMs: z.number().int().positive(), maxPackets: z.number().int().min(1).max(128),
    maxBytes: z.number().int().positive().max(MAX_EVIDENCE_CHECKPOINT_BYTES) }).strict(),
  packets: z.array(evidencePacketSchema).max(128),
  coverage: z.union([
    z.object({ status: z.literal('complete') }).strict(),
    z.object({ status: z.literal('incomplete'), reason: z.string().min(1).max(240), knownCut: ids }).strict(),
  ]),
}).strict();
const envelopeSchema = z.object({
  type: z.literal('doc.evidence.sync'), version: z.literal(1), requestId: z.string().uuid(),
  docId: z.string().uuid(), generation: z.string().uuid(), collabSeq: z.number().int().nonnegative(),
  snapshot: encoded(2 * 1024 * 1024),
  journal: z.object({ checkpoint: checkpointSchema, frontier: ids }).strict().nullable(),
}).strict();
export type DocEvidenceSync = z.infer<typeof envelopeSchema>;

export function parseDocEvidenceSync(input: unknown): DocEvidenceSync {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  if (typeof text !== 'string' || text.length > MAX_EVIDENCE_SYNC_BYTES
    || new TextEncoder().encode(text).length > MAX_EVIDENCE_SYNC_BYTES) throw new Error('Evidence sync budget exceeded');
  const value = envelopeSchema.parse(JSON.parse(text));
  if (value.journal) {
    const checkpoint = value.journal.checkpoint;
    const size = new TextEncoder().encode(JSON.stringify(checkpoint)).length;
    if (checkpoint.packets.length > checkpoint.limits.maxPackets || size > checkpoint.limits.maxBytes) {
      throw new Error('Evidence checkpoint budget exceeded');
    }
  }
  return value;
}
