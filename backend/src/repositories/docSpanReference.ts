import { config } from '../config';
import type { DbTransaction } from '../db/client';
import type { AuthenticatedMcpUser } from '../services/mcpToken';
import { createDocReferenceCodec, type DocReferenceCodec } from '../collab/docReference';
import { applyCurrentSpan, issueCurrentSpan, issueSpansAtCurrent, type CurrentSpanSelection } from './docCollab';
import { lockDoc, projectCurrentDocHistory } from './docCollabHistory';
import { assertCurrentDocAccess } from './docAccess';

type AuthorisedDocument = Pick<Awaited<ReturnType<typeof lockDoc>>, 'id' | 'projectId' | 'createdBy'>;
async function lockAuthorisedDoc(tx: DbTransaction, docId: string, authorised: AuthorisedDocument, userId: string, edit = false) {
  const doc = await lockDoc(tx, docId);
  if (doc.id !== authorised.id || doc.projectId !== authorised.projectId || doc.createdBy !== authorised.createdBy) {
    throw new Error('Access denied: document ownership changed; authorise the current resource again');
  }
  await assertCurrentDocAccess(tx, doc, userId, edit);
  return doc;
}

/** Internal adapter: caller supplies a server-authorised record, never a client assertion. */
export async function issueSignedCurrentSpan(tx: DbTransaction, input: {
  docId: string; blockId: string; from: number; to: number; inlineIndex?: number; token: AuthenticatedMcpUser; authorised: AuthorisedDocument;
}, codec: DocReferenceCodec = createDocReferenceCodec(config.sessionSecret)) {
  await lockAuthorisedDoc(tx, input.docId, input.authorised, input.token.userId);
  const issued = await issueCurrentSpan(tx, input.docId, input.blockId, input.from, input.to, input.inlineIndex);
  const targetRef = codec.sign({ docId: input.docId, generation: issued.generation, token: input.token }, issued.reference);
  return { docId: input.docId, generation: issued.generation, collabSeq: issued.collabSeq,
    scope: 'text_span' as const, targetRef };
}

/** Select and sign from one locked current state, not separately timed reads. */
export async function readSignedCurrentSpans<T extends CurrentSpanSelection & { referenceEligible?: boolean }>(tx: DbTransaction, input: {
  docId: string; token: AuthenticatedMcpUser; authorised: AuthorisedDocument;
}, select: (state: Uint8Array) => { selections: T[]; hasMore: boolean },
codec: DocReferenceCodec = createDocReferenceCodec(config.sessionSecret)) {
  await lockAuthorisedDoc(tx, input.docId, input.authorised, input.token.userId);
  const current = await projectCurrentDocHistory(tx, input.docId);
  const selected = select(current.state);
  const issued = await issueSpansAtCurrent(tx, current, selected.selections.filter(selection => selection.referenceEligible !== false));
  let referenceIndex = 0;
  return { doc: current.doc, generation: issued.generation, collabSeq: issued.collabSeq, hasMore: selected.hasMore,
    targets: selected.selections.map(({ referenceEligible, ...selection }) => referenceEligible === false
      ? { ...selection, scope: 'text_span' as const, targetStatus: 'unavailable' as const, reasonCode: 'TARGET_UNAVAILABLE' as const }
      : { ...selection, scope: 'text_span' as const, targetStatus: 'available' as const,
        targetRef: codec.sign({ docId: input.docId, generation: issued.generation, token: input.token }, issued.references[referenceIndex++]!) }) };
}

/** Call INSIDE the idempotent operation callback: committed receipts precede expiry checks. */
export async function applySignedCurrentSpan(tx: DbTransaction, input: {
  docId: string; targetRef: string; text: string; token: AuthenticatedMcpUser; authorised: AuthorisedDocument;
}, codec: DocReferenceCodec = createDocReferenceCodec(config.sessionSecret)) {
  const doc = await lockAuthorisedDoc(tx, input.docId, input.authorised, input.token.userId, true);
  const reference = codec.verify(input.targetRef, { docId: doc.id, generation: doc.collabGeneration, token: input.token });
  return applyCurrentSpan(tx, { docId: doc.id, generation: doc.collabGeneration,
    reference, text: input.text, actorId: input.token.userId });
}
