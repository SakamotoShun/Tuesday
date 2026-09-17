import * as Y from 'yjs';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { deriveValidatedDocBlocks, materializeDocHistory, MAX_DOC_SYNC_PAYLOAD_BYTES, MAX_DOC_UPDATE_BYTES } from './docHistory';

const encoded = z.string().min(1).max(4096);
export const spanReferenceSchema = z.object({
  issuedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  blockId: z.string().min(1).max(128),
  block: encoded, container: encoded, start: encoded, end: encoded,
}).strict();
export type SpanReference = z.infer<typeof spanReferenceSchema>;
export class DocSpanError extends Error {
  constructor(public readonly code: 'TARGET_GONE' | 'TARGET_UNAVAILABLE' | 'LIMIT_EXCEEDED', message: string) {
    super(message); this.name = 'DocSpanError';
  }
}
const unavailable = (message: string): never => { throw new DocSpanError('TARGET_UNAVAILABLE', message); };
const gone = (): never => { throw new DocSpanError('TARGET_GONE', 'The original target no longer survives.'); };
const encode = (type: Y.XmlElement | Y.XmlText, index: number, assoc: number) =>
  Buffer.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(type, index, assoc))).toString('base64');
function resolve(doc: Y.Doc, value: string, assoc: number, identity = false) {
  try {
    const position = Y.decodeRelativePosition(Buffer.from(value, 'base64'));
    if (position.assoc !== assoc || position.tname !== null || (identity && (!position.type || position.item))
      || Buffer.from(Y.encodeRelativePosition(position)).toString('base64') !== value) return unavailable('Invalid span boundary.');
    return Y.createAbsolutePositionFromRelativePosition(position, doc, false);
  } catch { return unavailable('Invalid span boundary.'); }
}
function scalar(value: string) {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) unavailable('Invalid Unicode boundary.');
}
function attributes(text: Y.XmlText, from: number, to: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > text.length || from > to) unavailable('Incompatible span boundaries.');
  if (from === to) gone();
  let offset = 0;
  const runs: Array<{ start: number; end: number; text: string; attributes: Record<string, unknown> }> = text.toDelta().map((part: { insert: unknown; attributes?: Record<string, unknown> }) => {
    if (typeof part.insert !== 'string') return unavailable('Embedded inline values are unsupported.');
    const start = offset; offset += part.insert.length;
    return { start, end: offset, text: part.insert, attributes: part.attributes ?? {} };
  });
  const selected = runs.filter(run => run.start < to && run.end > from);
  const attrs = selected[0]?.attributes;
  if (!attrs || selected.some(run => !isDeepStrictEqual(run.attributes, attrs))) unavailable('Span crosses a formatting boundary.');
  const plain = runs.map(run => run.text).join('');
  scalar(plain.slice(0, from)); scalar(plain.slice(from, to)); scalar(plain.slice(to));
  return attrs;
}
function withDoc<T>(state: Uint8Array, fn: (doc: Y.Doc) => T): T {
  const doc = materializeDocHistory(state, []);
  try { return fn(doc); } finally { doc.destroy(); }
}

/** Current-state semantics: original live containers and outward boundaries, never a text search fallback. */
export function issueSpan(state: Uint8Array, blockId: string, from: number, to: number, inlineIndex = 0, now = Date.now()): SpanReference {
  return withDoc(state, doc => {
    const blocks = [...doc.getXmlFragment('prosemirror').createTreeWalker(() => true)]
      .filter((node): node is Y.XmlElement => node instanceof Y.XmlElement && node.nodeName === 'blockContainer' && node.getAttribute('id') === blockId);
    if (blocks.length !== 1) return unavailable('Missing or ambiguous block.');
    const block = blocks[0]!;
    const body = block.get(0);
    if (!(body instanceof Y.XmlElement) || body.nodeName !== 'paragraph' || inlineIndex !== 0
      || body.length !== 1 || !(body.get(0) instanceof Y.XmlText)) return unavailable('Only a paragraph text container is supported.');
    const text = body.get(0) as Y.XmlText;
    attributes(text, from, to);
    return { issuedAt: now, expiresAt: now + 15 * 60_000, blockId,
      block: encode(block, 0, -1), container: encode(text, 0, -1), start: encode(text, from, -1), end: encode(text, to, 0) };
  });
}

export function applySpan(state: Uint8Array, reference: SpanReference, replacement: string) {
  return withDoc(state, doc => {
    const ref = spanReferenceSchema.parse(reference);
    const live = new Set(doc.getXmlFragment('prosemirror').createTreeWalker(() => true));
    const block = resolve(doc, ref.block, -1, true)?.type;
    const text = resolve(doc, ref.container, -1, true)?.type;
    if (!(block instanceof Y.XmlElement) || !live.has(block) || !(text instanceof Y.XmlText) || !live.has(text)) return gone();
    const body = block.get(0);
    if (block.nodeName !== 'blockContainer' || block.getAttribute('id') !== ref.blockId
      || !(body instanceof Y.XmlElement) || body.nodeName !== 'paragraph' || text.parent !== body
      || body.length !== 1) return unavailable('Target container changed structure.');
    const start = resolve(doc, ref.start, -1), end = resolve(doc, ref.end, 0);
    if (!start || !end || start.type !== text || end.type !== text) return unavailable('Endpoints no longer resolve in the original container.');
    const attrs = attributes(text, start.index, end.index);
    scalar(replacement);
    if (replacement.includes('\n') || replacement.includes('\r')) return unavailable('Structural line breaks are unsupported.');
    if (replacement.length > 16384) throw new DocSpanError('LIMIT_EXCEEDED', 'Replacement is too large.');
    const before = Y.encodeStateVector(doc);
    doc.transact(() => {
      text.delete(start.index, end.index - start.index);
      if (replacement) text.insert(start.index, replacement, attrs);
    }, 'agent-span');
    deriveValidatedDocBlocks(doc);
    const update = Y.encodeStateAsUpdate(doc, before);
    if (update.byteLength > MAX_DOC_UPDATE_BYTES || Y.encodeStateAsUpdate(doc).byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
      throw new DocSpanError('LIMIT_EXCEEDED', 'Patched document exceeds collaboration limits.');
    }
    return { update };
  });
}
