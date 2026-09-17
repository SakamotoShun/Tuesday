import { describe, expect, it } from 'bun:test';
import { randomUUID, createHmac } from 'node:crypto';
import { createDocReferenceCodec, DocReferenceError, MAX_DOC_REFERENCE_BYTES, MAX_DOC_REFERENCE_TTL_MS } from './docReference';
import type { DocReferenceContext } from './docReference';
import type { SpanReference } from './docSpan';

const secret = 'test-only-private-secret-'.repeat(3);
const context: DocReferenceContext = { docId: randomUUID(), generation: randomUUID(), token: {
  userId: randomUUID(), tokenId: randomUUID(), userName: 'Test', userEmail: 'test@example.com', userRole: 'member', scopes: new Set(['docs:read']),
} };
const reference: SpanReference = { issuedAt: 1000, expiresAt: 901000, blockId: 'paragraph', block: 'AAA=', container: 'AAA=', start: 'AAA=', end: 'AAA=' };
const codec = createDocReferenceCodec(secret, () => 1000);

describe('bounded signed span references', () => {
  it('round trips across codec instances without storing or changing the reference', () => {
    const token = codec.sign(context, reference);
    expect(Buffer.byteLength(token)).toBeLessThanOrEqual(MAX_DOC_REFERENCE_BYTES);
    expect(createDocReferenceCodec(secret, () => 1001).verify(token, context)).toEqual(reference);
  });

  it.each([undefined, '', 'short', ' '.repeat(32), 'default-secret-change-in-production-min-32-chars', ' default-secret-change-in-production-min-32-chars\n'])(
    'refuses unsafe configuration %s', value => {
      expect(() => createDocReferenceCodec(value)).toThrow('Configure a private installation');
    });

  it('rejects altered payload, signature, key, purpose and noncanonical encoding', () => {
    const token = codec.sign(context, reference);
    const [payload, signature] = token.split('.') as [string, string];
    const changed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    changed.reference.blockId = 'another';
    expect(() => codec.verify(`${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`, context)).toThrow(DocReferenceError);
    expect(() => codec.verify(`${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`, context)).toThrow(DocReferenceError);
    expect(() => createDocReferenceCodec('rotated-secret-'.repeat(4), () => 1000).verify(token, context)).toThrow(DocReferenceError);
    expect(() => codec.verify(`${payload}=.${signature}`, context)).toThrow(DocReferenceError);
    // Even an authenticated payload must obey the fixed purpose and strict schema.
    const authenticated = (value: unknown) => {
      const body = Buffer.from(JSON.stringify(value)).toString('base64url');
      const key = createHmac('sha256', secret).update('tuesday.doc-span.v2').digest();
      return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
    };
    expect(() => codec.verify(authenticated({ ...changed, purpose: 'other' }), context)).toThrow(DocReferenceError);
    expect(() => codec.verify(authenticated({ ...changed, unexpected: true }), context)).toThrow(DocReferenceError);
  });

  it('binds document, generation, PAT credential and principal type', () => {
    const token = codec.sign(context, reference);
    for (const other of [
      { ...context, docId: randomUUID() }, { ...context, generation: randomUUID() },
      { ...context, token: { ...context.token, tokenId: randomUUID() } },
      { ...context, token: { ...context.token, authType: 'oauth' as const, clientId: 'client' } },
    ]) expect(() => codec.verify(token, other)).toThrow(DocReferenceError);
  });

  it('survives OAuth token rotation but rejects another user or client', () => {
    const oauth = { ...context, token: { ...context.token, authType: 'oauth' as const, clientId: 'client' } };
    const token = codec.sign(oauth, reference);
    expect(codec.verify(token, { ...oauth, token: { ...oauth.token, tokenId: randomUUID() } })).toEqual(reference);
    for (const identity of [{ clientId: 'other' }, { userId: randomUUID() }]) {
      expect(() => codec.verify(token, { ...oauth, token: { ...oauth.token, ...identity } })).toThrow(DocReferenceError);
    }
  });

  it('rejects expiry, future issuance and extending the lifetime', () => {
    const token = codec.sign(context, reference);
    expect(() => createDocReferenceCodec(secret, () => reference.expiresAt).verify(token, context)).toThrow('expired');
    expect(() => createDocReferenceCodec(secret, () => 999).verify(token, context)).toThrow(DocReferenceError);
    expect(() => codec.sign(context, { ...reference, expiresAt: reference.issuedAt + MAX_DOC_REFERENCE_TTL_MS + 1 })).toThrow(DocReferenceError);
    expect(() => codec.sign(context, { ...reference, expiresAt: reference.issuedAt })).toThrow(DocReferenceError);
  });

  it('refuses oversized references instead of truncating boundaries', () => {
    expect(() => codec.sign(context, { ...reference, start: 'x'.repeat(4000) })).toThrow('size limit');
    for (const token of ['', 'a.b.c', '.'.repeat(4097), 'é'.repeat(4096)]) {
      expect(() => codec.verify(token, context)).toThrow(DocReferenceError);
    }
  });
});
