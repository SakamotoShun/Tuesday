import { eq } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { DbTransaction } from '../db/client';
import { docCollabContinuity } from '../db/schema';
import { ContinuityJournal, ContinuityError, type ContinuityPacket } from '../collab/docContinuityExperiment';
import { DocGenerationMismatchError, DocInvalidUpdateError } from '../collab/docHistory';
import type { LockedDoc } from './docCollabHistory';
import { readCurrentDocHistory, lockDoc } from './docCollabHistory';
import { assertCurrentDocAccess } from './docAccess';
import { parseDocEvidenceSync } from '../collab/docEvidenceSyncProtocol';

// Internal bounded adapter; raw references/packets are not public API contracts.
export function assertDocGeneration(doc: LockedDoc, expected: string): void {
  if (doc.collabGeneration !== expected) throw new DocGenerationMismatchError();
}

export async function loadDocContinuity(tx: DbTransaction, doc: LockedDoc) {
  const [stored] = await tx.select().from(docCollabContinuity).where(eq(docCollabContinuity.docId, doc.id));
  if (!stored) return null;
  assertDocGeneration(doc, stored.generation);
  return { journal: ContinuityJournal.fromCheckpoint(JSON.parse(stored.checkpoint.toString())), throughSeq: stored.throughSeq };
}

export async function saveDocContinuity(tx: DbTransaction, doc: LockedDoc, journal: ContinuityJournal, seq: number) {
  const values = { docId: doc.id, generation: doc.collabGeneration, throughSeq: seq,
    checkpoint: Buffer.from(JSON.stringify(journal.checkpoint())), updatedAt: new Date() };
  await tx.insert(docCollabContinuity).values(values).onConflictDoUpdate({ target: docCollabContinuity.docId, set: values });
}

/** One locked observation point; SQL sequence alone never certifies ancestry. */
export async function readDocEvidenceSync(tx: DbTransaction, docId: string, userId: string, generation: string, requestId: string, initialise = false) {
  const doc = await lockDoc(tx, docId);
  await assertCurrentDocAccess(tx, doc, userId);
  assertDocGeneration(doc, generation);
  const current = await readCurrentDocHistory(tx, docId);
  let stored = await loadDocContinuity(tx, doc);
  // Opt-in sessions establish the baseline before the first editable sync.
  // An existing incomplete journal is never replaced or healed here.
  if (!stored && initialise) {
    stored = { journal: new ContinuityJournal(current.state), throughSeq: current.collabSeq };
    await saveDocContinuity(tx, doc, stored.journal, stored.throughSeq);
  }
  if (stored && stored.throughSeq !== current.collabSeq) throw new DocInvalidUpdateError('Continuity sequence mismatch');
  if (stored?.journal.checkpoint().coverage.status === 'complete'
    && !Buffer.from(stored.journal.currentState()).equals(Buffer.from(current.state))) {
    throw new DocInvalidUpdateError('Continuity does not cover durable history');
  }
  return parseDocEvidenceSync({ type: 'doc.evidence.sync', version: 1, requestId, docId,
    generation: doc.collabGeneration, collabSeq: current.collabSeq, snapshot: Buffer.from(current.state).toString('base64'),
    journal: stored ? { checkpoint: stored.journal.checkpoint(), frontier: stored.journal.heads() } : null });
}

/** A missing/unsupported writer cannot silently certify continuity. Content still flows. */
export function acceptDocEvidence(journal: ContinuityJournal, update: Uint8Array, packet?: ContinuityPacket) {
  if (!packet) { journal.markIncomplete('Writer supplied no continuity evidence'); return false; }
  if (packet.update !== Buffer.from(update).toString('base64')) throw new DocInvalidUpdateError('Evidence update does not match content');
  const existing = journal.checkpoint().packets.find(item => item.id === packet.id);
  if (existing) {
    if (!isDeepStrictEqual(existing, packet)) throw new DocInvalidUpdateError('Contradictory evidence retry');
    return true;
  }
  try { journal.accept(packet); }
  catch (error) {
    if (!(error instanceof ContinuityError)) throw error;
    // Unsupported evidence and capacity exhaustion permanently close the agent gate.
    journal.markIncomplete(`Evidence unavailable: ${error.code}`);
  }
  return false;
}
