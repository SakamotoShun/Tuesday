import { BlockNoteEditor, docToBlocks, inlineContentToNodes } from '@blocknote/core';
import { isDeepStrictEqual } from 'node:util';
import { initProseMirrorDoc } from 'y-prosemirror';
import * as Y from 'yjs';
import { z } from 'zod';
import { docTargetSchema } from './docTargetSchema';
import {
  decodeStrictBase64,
  materializeDocHistory,
  MAX_DOC_SYNC_PAYLOAD_BYTES,
  MAX_DOC_UPDATE_BYTES,
} from './docHistory';
import {
  MAX_DOC_CONTENT_BYTES,
  MAX_DOC_EDIT_OPERATIONS,
  MAX_DOC_JSON_DEPTH,
  validateRawDocBlocks,
  type RawDocBlock,
} from '../utils/doc-blocks';

// Local milestone-1 experiment only. These unsigned references are NOT secure,
// authorized, principal/document-bound, expiring, or suitable for production APIs.
// Revision 3 is a rejected discriminator, retained for reproducible gate evidence.
// Witnesses reject permitted unrelated deletions and miss new-neighbour merges.
// docTargetDiscriminator.test.ts proves that the missing structural provenance
// cannot be recovered from current Yjs state. Do NOT integrate this resolver.
const editor = BlockNoteEditor.create({ schema: docTargetSchema });
const encodedPosition = z.string().min(1).max(4096);
const blockRefSchema = z.object({
  kind: z.literal('body'),
  blockId: z.string().min(1),
  blockType: z.string().min(1),
  container: encodedPosition,
}).strict();
// Boundary witness for one side of a span. 'anchor': the outward endpoint is attached
// to an outside character, which must survive. Otherwise the span touched its container
// boundary and the witness is the neighbouring inline container in document order
// (encoded identity), or 'none' when the document had no inline container on that side.
const witnessSchema = z.union([z.literal('anchor'), z.literal('none'), encodedPosition]);
const textRefSchema = z.object({
  kind: z.literal('text'),
  block: blockRefSchema,
  container: encodedPosition,
  start: encodedPosition,
  end: encodedPosition,
  before: witnessSchema,
  after: witnessSchema,
}).strict();
const styledTextSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  styles: z.record(z.union([z.boolean(), z.string()])),
}).strict();
const inlineSchema = z.union([
  styledTextSchema,
  z.object({
    type: z.literal('link'),
    href: z.string(),
    content: z.array(styledTextSchema),
  }).strict(),
]);
const operationsSchema = z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('replace_text'), targetRef: textRefSchema, text: z.string() }).strict(),
  z.object({ type: z.literal('replace_body'), targetRef: blockRefSchema, content: z.array(inlineSchema) }).strict(),
])).min(1).max(MAX_DOC_EDIT_OPERATIONS);

export type BlockTargetRef = z.infer<typeof blockRefSchema>;
export type TextTargetRef = z.infer<typeof textRefSchema>;
export type TargetInlineContent = z.infer<typeof inlineSchema>;
export type TargetPatchOperation = z.infer<typeof operationsSchema>[number];
export interface InspectedTarget {
  blockId: string;
  /** Identity only: complex bodies (tables, hard breaks, atoms) still reject replacement. */
  blockRef: BlockTargetRef;
  spans: Array<{ text: string; targetRef: TextTargetRef }>;
}

export class DocTargetError extends Error {
  constructor(
    public readonly code: 'INVALID_REFERENCE' | 'INVALID_PATCH' | 'INVALID_DOCUMENT'
      | 'TARGET_GONE' | 'TARGET_UNRESOLVABLE' | 'CONFLICT' | 'NORMALIZATION' | 'LIMIT_EXCEEDED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DocTargetError';
  }
}

function fail(code: DocTargetError['code'], message: string): never {
  throw new DocTargetError(code, message);
}

function encodePosition(type: Y.XmlElement | Y.XmlText, index: number, assoc: number): string {
  return Buffer.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(type, index, assoc)))
    .toString('base64');
}

export function encodeContainerIdentity(container: Y.XmlElement | Y.XmlText): string {
  if (!container.doc || !container.parent) fail('INVALID_REFERENCE', 'Container must be integrated and nested');
  return encodePosition(container, 0, -1);
}

function decodePosition(encoded: string, assoc: number, container = false): Y.RelativePosition {
  try {
    const bytes = decodeStrictBase64(encoded, 4096);
    const position = Y.decodeRelativePosition(bytes);
    if (position.assoc !== assoc || position.tname !== null
      || (container && (position.type === null || position.item !== null))
      || Buffer.from(Y.encodeRelativePosition(position)).toString('base64') !== encoded) {
      fail('INVALID_REFERENCE', 'Unexpected relative-position encoding');
    }
    return position;
  } catch (cause) {
    if (cause instanceof DocTargetError) throw cause;
    throw new DocTargetError('INVALID_REFERENCE', 'Invalid relative position', { cause });
  }
}

function project(doc: Y.Doc): RawDocBlock[] {
  const root = doc.getXmlFragment('prosemirror');
  const stack = [{ node: root as Y.XmlFragment, depth: 0 }];
  const ids = new Set<string>();
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (depth > MAX_DOC_JSON_DEPTH) fail('LIMIT_EXCEEDED', 'XML nesting exceeds the experiment limit');
    if (node instanceof Y.XmlElement && node.nodeName === 'blockContainer') {
      const id = node.getAttribute('id');
      if (typeof id !== 'string' || !id || ids.has(id)) fail('INVALID_DOCUMENT', 'Missing or duplicate block ID');
      ids.add(id);
    }
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlElement) stack.push({ node: child, depth: depth + 1 });
      else if (child instanceof Y.XmlText) textRuns(child);
    }
  }

  const before = Y.encodeStateAsUpdate(doc);
  try {
    const projected = initProseMirrorDoc(root, editor.pmSchema).doc;
    if (!Buffer.from(before).equals(Buffer.from(Y.encodeStateAsUpdate(doc)))) {
      fail('NORMALIZATION', 'Projection changed the binary history');
    }
    projected.check();
    projected.descendants((node) => {
      // BlockNote 0.49's converter can drop separators between cell paragraphs
      // with different marks. Reject this shape before returning a lossy projection.
      if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.childCount > 1) {
        fail('NORMALIZATION', 'Multi-paragraph table cells cannot be projected faithfully');
      }
    });
    // Match persisted table JSON (unset fields omitted, unset widths become null).
    const blocks: unknown = JSON.parse(JSON.stringify(docToBlocks(projected, editor.pmSchema)));
    validateRawDocBlocks(blocks);
    return blocks;
  } catch (cause) {
    if (!Buffer.from(before).equals(Buffer.from(Y.encodeStateAsUpdate(doc)))) {
      throw new DocTargetError('NORMALIZATION', 'Projection changed the binary history', { cause });
    }
    if (cause instanceof DocTargetError) throw cause;
    throw new DocTargetError('INVALID_DOCUMENT', 'Invalid projected document', { cause });
  }
}

function withDocument<T>(state: Uint8Array, run: (doc: Y.Doc) => T): T {
  if (!(state instanceof Uint8Array) || state.byteLength === 0) fail('INVALID_DOCUMENT', 'Expected binary Yjs state');
  if (state.byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) fail('LIMIT_EXCEEDED', 'Binary state exceeds the sync limit');
  const doc = materializeDocHistory(state, []);
  try {
    project(doc);
    return run(doc);
  } finally {
    doc.destroy();
  }
}

function isWithin(node: Y.AbstractType<any>, ancestor: Y.XmlElement): boolean {
  for (let current: Y.AbstractType<any> | null = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

/** Inline containers in document order; the neighbours of a span at its container boundary. */
function inlineNeighbours(text: Y.XmlText): { before: Y.XmlText | null; after: Y.XmlText | null } {
  if (!text.doc) fail('INVALID_REFERENCE', 'Inline container must be integrated');
  const texts = Array.from(text.doc.getXmlFragment('prosemirror').createTreeWalker((node) => node instanceof Y.XmlText)) as Y.XmlText[];
  const index = texts.indexOf(text);
  if (index < 0) fail('INVALID_REFERENCE', 'Inline container is not reachable from the document');
  return { before: texts[index - 1] ?? null, after: texts[index + 1] ?? null };
}

/**
 * A span keeps its identity only while both boundaries survive. An endpoint attached to an
 * outside character resolves one index apart from the same character's other side while it
 * lives and to the same index once deleted, so a split through the span (which deletes the
 * character after it) is rejected. An endpoint at the container boundary requires the
 * neighbouring inline container observed at issuance to survive, so a merge (which deletes
 * the neighbour whose text it moves in) is rejected. Boundary insertions and replacements
 * that keep both witnesses remain part of the current interval.
 */
function verifyWitness(
  doc: Y.Doc, live: Set<Y.AbstractType<any>>, text: Y.XmlText, position: Y.RelativePosition,
  index: number, witness: string, side: 'before' | 'after',
): void {
  if (position.item !== null) {
    if (witness !== 'anchor') fail('INVALID_REFERENCE', 'Witness does not match its endpoint encoding');
    const otherSide = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON({ ...Y.relativePositionToJSON(position), assoc: position.assoc < 0 ? 0 : -1 }), doc, false,
    );
    if (!otherSide || otherSide.type !== text || otherSide.index !== (side === 'before' ? index - 1 : index + 1)) {
      fail('TARGET_UNRESOLVABLE', `The character ${side} the span no longer survives`);
    }
    return;
  }
  if (witness === 'anchor') fail('INVALID_REFERENCE', 'Witness does not match its endpoint encoding');
  if (witness === 'none') return;
  const neighbour = Y.createAbsolutePositionFromRelativePosition(decodePosition(witness, -1, true), doc, false)?.type;
  if (!(neighbour instanceof Y.XmlText) || !live.has(neighbour)) {
    fail('TARGET_UNRESOLVABLE', `The inline container ${side} the span no longer survives`);
  }
}

function textRuns(text: Y.XmlText): Array<{ text: string; start: number; end: number; attributes: Record<string, unknown> }> {
  let offset = 0;
  return text.toDelta().map((part: { insert: unknown; attributes?: Record<string, unknown> }) => {
    if (typeof part.insert !== 'string') fail('TARGET_UNRESOLVABLE', 'Embedded text values are unsupported');
    const start = offset;
    offset += part.insert.length;
    return { text: part.insert, start, end: offset, attributes: part.attributes ?? {} };
  });
}

function validateText(value: string): void {
  // Offsets are UTF-16, but edits must not manufacture lone surrogate halves.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    fail('TARGET_UNRESOLVABLE', 'An edit splits a Unicode surrogate pair');
  }
}

function rangeAttributes(text: Y.XmlText, start: number, end: number): Record<string, unknown> {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start > end) {
    fail('TARGET_UNRESOLVABLE', 'Invalid text interval');
  }
  if (start === end) fail('TARGET_GONE', 'The formerly nonempty text interval is empty');
  const runs = textRuns(text);
  const intersecting = runs.filter((run) => run.start < end && run.end > start);
  const attributes = intersecting[0]?.attributes;
  if (!attributes || intersecting.some((run) => !isDeepStrictEqual(run.attributes, attributes))) {
    fail('TARGET_UNRESOLVABLE', 'Text interval crosses a mark boundary');
  }
  const plain = runs.map((run) => run.text).join('');
  validateText(plain.slice(0, start));
  validateText(plain.slice(start, end));
  validateText(plain.slice(end));
  return attributes;
}

// Also exported for retained-tombstone tests on gc:false documents. Resolution
// never projects or mutates its input; parent pointers alone are not liveness.
export function resolveExperimentalTarget(doc: Y.Doc, ref: BlockTargetRef | TextTargetRef) {
  const parsed = z.union([blockRefSchema, textRefSchema]).safeParse(ref);
  if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data), 'utf8') > 4096) fail('INVALID_REFERENCE', 'Invalid target reference');
  ref = parsed.data;
  const blockRef = ref.kind === 'body' ? ref : ref.block;
  const live = new Set(doc.getXmlFragment('prosemirror').createTreeWalker(() => true));
  const block = Y.createAbsolutePositionFromRelativePosition(decodePosition(blockRef.container, -1, true), doc, false)?.type;
  if (!(block instanceof Y.XmlElement) || !live.has(block)) fail('TARGET_GONE', 'Block container no longer survives');
  if (block.nodeName !== 'blockContainer' || block.getAttribute('id') !== blockRef.blockId) {
    fail('TARGET_UNRESOLVABLE', 'Block identity does not match');
  }
  const body = block.get(0);
  if (!(body instanceof Y.XmlElement) || body.nodeName !== blockRef.blockType) {
    fail('TARGET_UNRESOLVABLE', 'Block body type changed');
  }
  if (ref.kind === 'body') return { block, body, text: null, start: 0, end: 0, attributes: {} };
  const text = Y.createAbsolutePositionFromRelativePosition(decodePosition(ref.container, -1, true), doc, false)?.type;
  if (!(text instanceof Y.XmlText) || !live.has(text)) fail('TARGET_GONE', 'Inline container no longer survives');
  if (!isWithin(text, body) || !(text.parent instanceof Y.XmlElement)
    || !editor.pmSchema.nodes[text.parent.nodeName]?.isTextblock) {
    fail('TARGET_UNRESOLVABLE', 'Inline container has incompatible ancestry');
  }
  const startPosition = decodePosition(ref.start, -1);
  const endPosition = decodePosition(ref.end, 0);
  const start = Y.createAbsolutePositionFromRelativePosition(startPosition, doc, false);
  const end = Y.createAbsolutePositionFromRelativePosition(endPosition, doc, false);
  if (!start || !end || start.type !== text || end.type !== text) fail('TARGET_UNRESOLVABLE', 'Text endpoints do not resolve in the same container');
  verifyWitness(doc, live, text, startPosition, start.index, ref.before, 'before');
  verifyWitness(doc, live, text, endPosition, end.index, ref.after, 'after');
  const attributes = rangeAttributes(text, start.index, end.index);
  return { block, body, text, start: start.index, end: end.index, attributes };
}

function spanRef(block: BlockTargetRef, text: Y.XmlText, start: number, end: number): TextTargetRef {
  rangeAttributes(text, start, end);
  const neighbours = inlineNeighbours(text);
  const witness = (neighbour: Y.XmlText | null) => (neighbour ? encodeContainerIdentity(neighbour) : 'none');
  return {
    kind: 'text', block, container: encodeContainerIdentity(text),
    // Index 0 with left association and the length with right association encode the
    // container boundary itself (null item); every other endpoint is attached to a character.
    start: encodePosition(text, start, -1), end: encodePosition(text, end, 0),
    before: start === 0 ? witness(neighbours.before) : 'anchor',
    after: end === text.length ? witness(neighbours.after) : 'anchor',
  };
}

/** Each span is a complete homogeneous mark run within one actual XmlText. */
export function inspectTargets(state: Uint8Array): InspectedTarget[] {
  return withDocument(state, (doc) => {
    const targets: InspectedTarget[] = [];
    for (const block of doc.getXmlFragment('prosemirror').createTreeWalker(() => true)) {
      if (!(block instanceof Y.XmlElement) || block.nodeName !== 'blockContainer') continue;
      const body = block.get(0);
      if (!(body instanceof Y.XmlElement)) continue;
      const blockRef: BlockTargetRef = {
        kind: 'body', blockId: block.getAttribute('id')!, blockType: body.nodeName,
        container: encodeContainerIdentity(block),
      };
      const spans: InspectedTarget['spans'] = [];
      for (const text of body.createTreeWalker(() => true)) {
        if (!(text instanceof Y.XmlText) || !(text.parent instanceof Y.XmlElement)
          || !editor.pmSchema.nodes[text.parent.nodeName]?.isTextblock) continue;
        for (const run of textRuns(text)) {
          if (run.text.length) spans.push({ text: run.text, targetRef: spanRef(blockRef, text, run.start, run.end) });
        }
      }
      targets.push({ blockId: blockRef.blockId, blockRef, spans });
    }
    return targets;
  });
}

/** Issue a narrower span using UTF-16 offsets within the currently resolved span. */
export function issueTextSpan(state: Uint8Array, targetRef: TextTargetRef, from: number, to: number): TextTargetRef {
  return withDocument(state, (doc) => {
    const target = resolveExperimentalTarget(doc, targetRef);
    if (!target.text || from < 0 || to > target.end - target.start) fail('TARGET_UNRESOLVABLE', 'Subspan exceeds its target');
    return spanRef(targetRef.block, target.text, target.start + from, target.start + to);
  });
}

/**
 * Mutates only a disposable copy of the supplied history. Apply the returned
 * delta to replicas of that history, never to independently imported blocks.
 * Opaque Yjs data survives; blocks is a schema projection, not a metadata sidecar.
 */
export function applyTargetPatch(state: Uint8Array, operations: TargetPatchOperation[]): { update: Uint8Array; blocks: RawDocBlock[] } {
  let parsed: z.SafeParseReturnType<unknown, TargetPatchOperation[]>;
  try {
    if (Buffer.byteLength(JSON.stringify(operations), 'utf8') > MAX_DOC_CONTENT_BYTES) fail('LIMIT_EXCEEDED', 'Patch exceeds the content limit');
    parsed = operationsSchema.safeParse(operations);
  } catch (cause) {
    if (cause instanceof DocTargetError) throw cause;
    throw new DocTargetError('INVALID_PATCH', 'Patch must be JSON serializable', { cause });
  }
  if (!parsed.success) fail('INVALID_PATCH', 'Invalid patch operations');
  return withDocument(state, (doc) => {
    const prepared = parsed.data.map((operation) => {
      const target = resolveExperimentalTarget(doc, operation.targetRef);
      let runs: Array<{ text: string; attributes: Record<string, unknown> }>;
      if (operation.type === 'replace_text') {
        if (!target.text) fail('INVALID_REFERENCE', 'Text operation requires a span');
        validateText(operation.text);
        if (operation.text.includes('\n') && !editor.pmSchema.nodes[(target.text.parent as Y.XmlElement).nodeName].spec.code) {
          fail('TARGET_UNRESOLVABLE', 'Non-code newline insertion needs an explicit hard-break operation');
        }
        runs = [{ text: operation.text, attributes: target.attributes }];
      } else {
        const children = target.body.toArray();
        if (!editor.pmSchema.nodes[target.body.nodeName]?.isTextblock
          || children.length > 1 || (children.length === 1 && !(children[0] instanceof Y.XmlText))) {
          fail('TARGET_UNRESOLVABLE', 'Body replacement supports only empty or single-XmlText bodies');
        }
        target.text = (children[0] as Y.XmlText | undefined) ?? null;
        target.start = 0;
        target.end = target.text?.length ?? 0;
        for (const inline of operation.content) {
          for (const part of inline.type === 'link' ? inline.content : [inline]) {
            validateText(part.text);
            for (const [name, value] of Object.entries(part.styles)) {
              const spec = docTargetSchema.styleSchema[name as keyof typeof docTargetSchema.styleSchema];
              if (!spec || typeof value !== spec.propSchema) fail('INVALID_PATCH', 'Unsupported inline style');
            }
          }
        }
        const nodes = inlineContentToNodes<typeof docTargetSchema.inlineContentSchema, typeof docTargetSchema.styleSchema>(
          operation.content, editor.pmSchema, target.body.nodeName,
        );
        runs = nodes.map((node) => {
          if (!node.isText) fail('TARGET_UNRESOLVABLE', 'Replacement contains an unsupported inline node');
          const attributes: Record<string, unknown> = {};
          for (const mark of node.marks) {
            if (!mark.type.excludes(mark.type)) fail('TARGET_UNRESOLVABLE', 'Overlapping marks are unsupported');
            attributes[mark.type.name] = mark.attrs;
          }
          return { text: node.text!, attributes };
        });
      }
      return { operation, ...target, runs };
    });

    for (let i = 0; i < prepared.length; i++) {
      for (let j = i + 1; j < prepared.length; j++) {
        const a = prepared[i], b = prepared[j];
        const relatedBlocks = isWithin(a.block, b.block) || isWithin(b.block, a.block);
        const ancestryConflict = relatedBlocks && (a.block !== b.block
          || a.operation.type === 'replace_body' || b.operation.type === 'replace_body');
        if (ancestryConflict || (a.text && a.text === b.text && a.start < b.end && b.start < a.end)) {
          fail('CONFLICT', 'Patch targets overlap or have conflicting ancestry');
        }
      }
    }

    const before = Y.encodeStateVector(doc);
    // Resolve everything before mutation. Descending offsets preserve intervening
    // character identities; Yjs transactions group updates but do NOT roll back.
    doc.transact(() => {
      for (const target of prepared.sort((a, b) => b.start - a.start)) {
        let text = target.text;
        if (!text && target.runs.length) {
          text = new Y.XmlText();
          target.body.insert(0, [text]);
        }
        if (!text) continue;
        text.delete(target.start, target.end - target.start);
        let offset = target.start;
        for (const run of target.runs) {
          if (run.text.length) text.insert(offset, run.text, run.attributes);
          offset += run.text.length;
        }
      }
    }, 'doc-target-experiment');
    const blocks = project(doc);
    const update = Y.encodeStateAsUpdate(doc, before);
    if (update.byteLength > MAX_DOC_UPDATE_BYTES || Y.encodeStateAsUpdate(doc).byteLength > MAX_DOC_SYNC_PAYLOAD_BYTES) {
      fail('LIMIT_EXCEEDED', 'Patched binary state exceeds collaboration limits');
    }
    return { update, blocks };
  });
}
