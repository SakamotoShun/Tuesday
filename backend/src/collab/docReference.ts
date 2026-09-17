import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { spanReferenceSchema, type SpanReference } from './docSpan';
import type { AuthenticatedMcpUser } from '../services/mcpToken';
import { principalFor } from '../mcp/principal';

export const MAX_DOC_REFERENCE_BYTES = 4096;
export const MAX_DOC_REFERENCE_TTL_MS = 15 * 60 * 1000;
const purpose = 'tuesday.doc-span.v2';
const envelopeSchema = z.object({
  version: z.literal(1), purpose: z.literal(purpose), docId: z.string().uuid(), generation: z.string().uuid(),
  principal: z.object({ type: z.enum(['pat', 'oauth']), id: z.string().min(1).max(512) }).strict(),
  reference: spanReferenceSchema,
}).strict();

export class DocReferenceError extends Error {
  constructor(public readonly code: 'REFERENCE_INVALID' | 'REFERENCE_EXPIRED' | 'REFERENCE_TOO_LARGE' | 'REFERENCE_CONFIG_REQUIRED') {
    super(code === 'REFERENCE_CONFIG_REQUIRED'
      ? 'Configure a private installation SESSION_SECRET of at least 32 bytes before issuing document references.'
      : code === 'REFERENCE_EXPIRED' ? 'Document reference expired; obtain a fresh authorised read.'
      : code === 'REFERENCE_TOO_LARGE' ? 'Document reference exceeds the encoded size limit.'
      : 'Document reference is invalid for this request.');
    this.name = 'DocReferenceError';
  }
}

export interface DocReferenceContext {
  docId: string;
  generation: string;
  token: AuthenticatedMcpUser;
}

/** Authenticity is not authorisation or target liveness. Check those inside the locked operation. */
export function createDocReferenceCodec(installationSecret: string | undefined, now: () => number = Date.now) {
  if (!installationSecret || Buffer.byteLength(installationSecret.trim()) < 32
    || installationSecret.trim() === 'default-secret-change-in-production-min-32-chars') {
    throw new DocReferenceError('REFERENCE_CONFIG_REQUIRED');
  }
  const key = createHmac('sha256', installationSecret).update(purpose).digest();
  const signPayload = (payload: string) => createHmac('sha256', key).update(payload).digest();
  const invalid = (): never => { throw new DocReferenceError('REFERENCE_INVALID'); };
  function checkTime(reference: SpanReference) {
    const clock = now();
    if (!Number.isSafeInteger(clock) || clock < 0 || reference.issuedAt > clock
      || reference.expiresAt <= reference.issuedAt
      || reference.expiresAt - reference.issuedAt > MAX_DOC_REFERENCE_TTL_MS) invalid();
    if (clock >= reference.expiresAt) throw new DocReferenceError('REFERENCE_EXPIRED');
  }
  return {
    sign(context: DocReferenceContext, reference: SpanReference): string {
      const principal = principalFor(context.token);
      const parsed = envelopeSchema.safeParse({ version: 1, purpose, docId: context.docId, generation: context.generation,
        principal: { type: principal.type, id: principal.id }, reference });
      if (!parsed.success) return invalid();
      checkTime(parsed.data.reference);
      const payload = Buffer.from(JSON.stringify(parsed.data)).toString('base64url');
      const token = `${payload}.${signPayload(payload).toString('base64url')}`;
      if (Buffer.byteLength(token) > MAX_DOC_REFERENCE_BYTES) throw new DocReferenceError('REFERENCE_TOO_LARGE');
      return token;
    },
    verify(token: string, context: DocReferenceContext): SpanReference {
      // Bound work before splitting, decoding, signature verification or JSON parsing.
      if (typeof token !== 'string' || token.length > MAX_DOC_REFERENCE_BYTES) return invalid();
      const pieces = token.split('.');
      if (pieces.length !== 2) return invalid();
      const [payload, signature] = pieces as [string, string];
      if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return invalid();
      const provided = Buffer.from(signature, 'base64url');
      if (provided.toString('base64url') !== signature || !timingSafeEqual(signPayload(payload), provided)) return invalid();
      const bytes = Buffer.from(payload, 'base64url');
      if (bytes.toString('base64url') !== payload) return invalid();
      if (!Buffer.from(bytes.toString('utf8')).equals(bytes)) return invalid();
      let value: unknown;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { return invalid(); }
      const parsed = envelopeSchema.safeParse(value);
      if (!parsed.success || JSON.stringify(parsed.data) !== bytes.toString('utf8')) return invalid();
      const principal = principalFor(context.token);
      if (parsed.data.docId !== context.docId || parsed.data.generation !== context.generation
        || parsed.data.principal.type !== principal.type || parsed.data.principal.id !== principal.id) return invalid();
      checkTime(parsed.data.reference);
      return parsed.data.reference;
    },
  };
}

export type DocReferenceCodec = ReturnType<typeof createDocReferenceCodec>;
