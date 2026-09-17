import { BlockNoteEditor } from '@blocknote/core';
import { randomUUID } from 'node:crypto';
import { hasCancelledInsertion } from './docUndoContinuityExperiment';
import { isDeepStrictEqual } from 'node:util';
import type { Node as PMNode } from 'prosemirror-model';
import { ReplaceStep, Step, Transform } from 'prosemirror-transform';
import { initProseMirrorDoc } from 'y-prosemirror';
import * as Y from 'yjs';
import { z } from 'zod';
import { applyResolvedDocUpdate, decodeStrictBase64, materializeDocHistory, MAX_DOC_SYNC_PAYLOAD_BYTES, MAX_DOC_UPDATE_BYTES } from './docHistory';
import { docTargetSchema } from './docTargetSchema';
import {
  applyTargetPatch, inspectTargets, issueTextSpan,
  resolveExperimentalTarget, type TextTargetRef,
} from './docTargetExperiment';

// Unsigned, local-only oracle. The journal is outside Yjs and its undo scope.
// Missing provenance is UNKNOWN, never proof of continuity or a permanent break.
const editor = BlockNoteEditor.create({ schema: docTargetSchema });
const key = z.string().min(1).max(128);
const stepsSchema = z.array(z.unknown()).max(512);
// Covers worst-case JSON escaping of 32 x 128-character IDs and a 240-character
// reason. Reserved even while complete so losing coverage can never exceed maxBytes.
export const CONTINUITY_CONTROL_RESERVE_BYTES = 28 * 1024;
const packetSchema = z.object({
  id: key,
  parents: z.array(key).max(32),
  before: z.string().min(1),
  update: z.string().min(1),
  evidence: z.union([
    z.object({ kind: z.literal('pm'), steps: stepsSchema }).strict(),
    z.object({ kind: z.enum(['undo', 'redo']), sourceId: key.optional(), sourceSteps: stepsSchema }).strict(),
  ]),
}).strict();
const coverageSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('complete') }).strict(),
  z.object({ status: z.literal('incomplete'), reason: z.string().min(1).max(240),
    knownCut: z.array(key).max(32).refine(ids => new Set(ids).size === ids.length),
  }).strict(),
]);

// parents are the sender's complete observed frontier, including content-neutral
// batches. before/update are canonical base64; accepted PM steps are flattened in order.
export type ContinuityPacket = z.infer<typeof packetSchema>;
export interface ContinuityReference {
  epoch: string;
  issuedCut: string[];
  issuedSnapshot: string;
  issuedAt: number;
  expiresAt: number;
  target: TextTargetRef;
}
export type ContinuityDecision =
  | { status: 'safe'; start: number; end: number }
  | { status: 'broken' | 'gone' | 'unknown' | 'expired'; reason: string; eventId?: string };
export interface ContinuityOptions {
  now?: () => number;
  ttlMs?: number;
  maxPackets?: number;
  maxBytes?: number;
}
export interface ContinuityCheckpoint {
  version: 1;
  epoch: string;
  baseline: string;
  limits: { ttlMs: number; maxPackets: number; maxBytes: number };
  packets: ContinuityPacket[];
  coverage: z.infer<typeof coverageSchema>;
}

export class ContinuityError extends Error {
  constructor(public readonly code: 'INVALID_PACKET' | 'LIMIT_EXCEEDED' | 'UNKNOWN' | 'TARGET_GONE', message: string) {
    super(message);
    this.name = 'ContinuityError';
  }
}
const bytes = (value: Uint8Array) => Buffer.from(value).toString('base64');
function fail(message: string): never { throw new ContinuityError('INVALID_PACKET', message); }
function unknown(message: string): never { throw new ContinuityError('UNKNOWN', message); }
const rawSteps = (packet: ContinuityPacket) => packet.evidence.kind === 'pm' ? packet.evidence.steps : packet.evidence.sourceSteps;

function load(encoded: string): Y.Doc {
  return materializeDocHistory(decodeStrictBase64(encoded, MAX_DOC_SYNC_PAYLOAD_BYTES), []);
}

function projection(doc: Y.Doc) {
  const before = bytes(Y.encodeStateAsUpdate(doc));
  const result = initProseMirrorDoc(doc.getXmlFragment('prosemirror'), editor.pmSchema);
  if (bytes(Y.encodeStateAsUpdate(doc)) !== before) fail('Projection normalised the history');
  result.doc.check();
  return result;
}

function position(encoded: string, assoc: number, container = false) {
  const result = Y.decodeRelativePosition(decodeStrictBase64(encoded, 4096));
  if (result.assoc !== assoc || result.tname !== null || bytes(Y.encodeRelativePosition(result)) !== encoded
    || (container && (result.type === null || result.item !== null))) unknown('Invalid relative position');
  return result;
}

function locate(doc: Y.Doc, ref: TextTargetRef, range?: [number, number]) {
  const block = resolveExperimentalTarget(doc, ref.block);
  const text = Y.createAbsolutePositionFromRelativePosition(position(ref.container, -1, true), doc, false)?.type;
  const live = new Set(doc.getXmlFragment('prosemirror').createTreeWalker(() => true));
  if (!(text instanceof Y.XmlText) || !live.has(text)) throw new ContinuityError('TARGET_GONE', 'Original inline container is gone');
  if (text.parent !== block.body || block.body.nodeName !== 'paragraph') unknown('Only direct paragraph inline segments are certified');
  const start = range ? { type: text, index: range[0] } : Y.createAbsolutePositionFromRelativePosition(position(ref.start, -1), doc, false);
  const end = range ? { type: text, index: range[1] } : Y.createAbsolutePositionFromRelativePosition(position(ref.end, 0), doc, false);
  if (!start || !end || start.type !== text || end.type !== text || start.index > end.index
    || !Number.isInteger(start.index) || !Number.isInteger(end.index) || start.index < 0 || end.index > text.length) unknown('Endpoints cannot be located in the original container');
  const pm = projection(doc);
  const paragraph = pm.mapping.get(block.body);
  let pmStart = -1;
  pm.doc.descendants((node, offset) => { if (node === paragraph) pmStart = offset + 1; });
  if (pmStart < 0) unknown('Missing paragraph correspondence');
  for (const child of block.body.toArray()) {
    if (child === text) break;
    if (child instanceof Y.XmlText) pmStart += child.length;
    else {
      const mapped = pm.mapping.get(child);
      if (!mapped || Array.isArray(mapped)) unknown('Unsupported inline correspondence');
      pmStart += (mapped as PMNode).nodeSize;
    }
  }
  return { text, start: start.index, end: end.index, pmStart, pm: pm.doc };
}

function reanchor(ref: TextTargetRef, text: Y.XmlText, start: number, end: number): TextTargetRef {
  if (start < 0 || end > text.length || start > end) unknown('Mapped passage left its original inline container');
  return { ...ref,
    start: bytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, start, -1))),
    end: bytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, end, 0))),
  };
}

function plainParagraph(node: PMNode | null | undefined): boolean {
  return !!node && node.type.name === 'paragraph' && Array.from({ length: node.childCount }, (_, i) => node.child(i))
    .every(child => child.isText || child.type.name === 'hardBreak');
}

/** Exact, deliberately small whitelist. Positions are in the pre-step PM doc. */
function classify(doc: PMNode, step: Step): 'text' | 'split' | 'join' | 'blocks' | 'id' | 'unknown' {
  const json = step.toJSON();
  if (json.stepType === 'attr' && json.attr === 'id' && doc.nodeAt(json.pos)?.type.name === 'blockContainer') return 'id';
  if (json.stepType === 'replaceAround') {
    const old = doc.nodeAt(json.from);
    const replacement = step.apply(doc).doc?.nodeAt(json.from);
    if (old?.type.name === 'blockContainer' && replacement?.type === old.type
      && old.content.eq(replacement.content) && isDeepStrictEqual({ ...old.attrs, id: null }, { ...replacement.attrs, id: null })) {
      const candidate = new Transform(doc).setNodeMarkup(json.from, undefined, replacement.attrs).steps;
      if (candidate.length === 1 && isDeepStrictEqual({ ...candidate[0].toJSON(), structure: null }, { ...json, structure: null })) return 'id';
    }
  }
  if (!(step instanceof ReplaceStep)) return 'unknown';
  const { from, to, slice } = step;
  const left = doc.resolve(from), right = doc.resolve(to);
  if (left.sameParent(right) && plainParagraph(left.parent)) {
    const deleted = doc.slice(from, to);
    const inline = (node: PMNode) => node.isText;
    const allText = (fragment: typeof slice.content) => Array.from({ length: fragment.childCount }, (_, i) => fragment.child(i)).every(inline);
    if (slice.openStart === 0 && slice.openEnd === 0 && allText(slice.content)
      && deleted.openStart === 0 && deleted.openEnd === 0 && allText(deleted.content)) return 'text';
    if (to === from + 1 && slice.size === 0 && doc.nodeAt(from)?.type.name === 'hardBreak') return 'join';
    if (from === to && slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1
      && slice.content.firstChild?.type.name === 'hardBreak') return 'split';
    if (from === to && slice.openStart === 2 && slice.openEnd === 2 && left.node(left.depth - 1).type.name === 'blockContainer') {
      const after = slice.content.lastChild;
      if (after?.type.name === 'blockContainer' && plainParagraph(after.firstChild)
        && isDeepStrictEqual(after.firstChild!.attrs, left.parent.attrs)) {
        const candidate = new Transform(doc).split(from, 2, [
          { type: after.type, attrs: after.attrs }, { type: after.firstChild!.type, attrs: after.firstChild!.attrs },
        ]).steps;
        // PM inverses omit the structure guard, but retain the exact split shape.
        if (candidate.length === 1 && isDeepStrictEqual({ ...candidate[0].toJSON(), structure: null }, { ...json, structure: null })) return 'split';
      }
    }
  }
  if (to - from === 4 && slice.size === 0 && plainParagraph(left.parent) && plainParagraph(right.parent)
    && left.parentOffset === left.parent.content.size && right.parentOffset === 0) {
    try {
      const candidate = new Transform(doc).join(from + 2, 2).steps;
      if (candidate.length === 1 && isDeepStrictEqual({ ...candidate[0].toJSON(), structure: null }, { ...json, structure: null })) return 'join';
    } catch { /* Not an exact supported paragraph join. */ }
  }
  if (left.sameParent(right) && left.parent.type.name === 'blockGroup' && left.textOffset === 0 && right.textOffset === 0
    && slice.openStart === 0 && slice.openEnd === 0) {
    const closedBlocks = (fragment: typeof slice.content) => Array.from({ length: fragment.childCount }, (_, i) => fragment.child(i))
      .every(node => node.type.name === 'blockContainer' && node.childCount === 1 && plainParagraph(node.firstChild));
    if (closedBlocks(slice.content) && closedBlocks(doc.slice(from, to).content)) return 'blocks';
  }
  return 'unknown';
}

function checkSteps(doc: PMNode, steps: unknown[], start: number, end: number, segmentStart: number, segmentEnd: number, concurrent = false):
  { status: 'safe' | 'unknown'; start: number; end: number; touched: boolean } | { status: 'broken' } {
  let result: 'safe' | 'unknown' = 'safe';
  let mappingKnown = true;
  let touched = false;
  for (const json of steps) {
    const step = Step.fromJSON(editor.pmSchema, json);
    const kind = classify(doc, step);
    step.getMap().forEach((from, to) => { if (from <= segmentEnd && to >= segmentStart) touched = true; });
    if (kind === 'unknown') { result = 'unknown'; mappingKnown = false; }
    let endAssoc = 1;
    if (concurrent) {
      step.getMap().forEach((from, to) => { if (from <= end && to >= start) result = 'unknown'; });
    } else if (step instanceof ReplaceStep && mappingKnown) {
      if (kind === 'text' && step.from < start && step.to > end) {
        result = 'unknown';
        mappingKnown = false;
      }
      if (kind === 'split') {
        // A split strictly inside the selection breaks it even if a later step rejoins it.
        if (start < step.from && step.from < end) return { status: 'broken' };
        if (segmentStart <= step.from && step.from < segmentEnd && step.from <= start && end > step.from) return { status: 'broken' };
        // A new paragraph/segment after the selected text is not part of that text.
        if (step.from === end) endAssoc = -1;
      } else if (kind === 'join') {
        const left = doc.resolve(step.from), right = doc.resolve(step.to);
        const hardBreak = step.to - step.from === 1;
        let leftStart = left.start(), rightEnd = right.end();
        if (hardBreak) left.parent.forEach((child, offset) => {
          const pos = left.start() + offset;
          if (child.type.name === 'hardBreak' && pos < step.from) leftStart = pos + 1;
          if (child.type.name === 'hardBreak' && pos >= step.to) rightEnd = Math.min(rightEnd, pos);
        });
        if ((start >= leftStart && start <= step.from && end >= step.from && rightEnd > step.to)
          || (start <= step.to && end >= step.to && end <= rightEnd && leftStart < step.from)) return { status: 'broken' };
      }
    }
    const applied = step.apply(doc);
    if (!applied.doc) fail('Step failed during continuity evaluation');
    start = step.getMap().map(start, -1);
    end = step.getMap().map(end, endAssoc);
    segmentStart = step.getMap().map(segmentStart, -1);
    segmentEnd = step.getMap().map(segmentEnd, endAssoc);
    doc = applied.doc;
  }
  return { status: result, start, end, touched };
}

export class ContinuityJournal {
  private readonly baseline: string;
  private epoch: string = randomUUID();
  private readonly now: () => number;
  private readonly limits: ContinuityCheckpoint['limits'];
  private packets = new Map<string, ContinuityPacket>();
  private accepted = new Set<string>();
  private coverage: ContinuityCheckpoint['coverage'] = { status: 'complete' };

  constructor(baseline: string | Uint8Array, options: ContinuityOptions = {}) {
    this.baseline = typeof baseline === 'string' ? baseline : bytes(baseline);
    this.now = options.now ?? Date.now;
    this.limits = { ttlMs: options.ttlMs ?? 900_000, maxPackets: options.maxPackets ?? 32, maxBytes: options.maxBytes ?? 8 * 1024 * 1024 };
    if (!Object.values(this.limits).every(value => Number.isSafeInteger(value) && value > 0) || this.limits.maxPackets > 128) fail('Invalid journal limits');
    inspectTargets(decodeStrictBase64(this.baseline, MAX_DOC_SYNC_PAYLOAD_BYTES));
    this.assertBudget(this.packets);
  }

  private checkpointValue(packets = this.packets): ContinuityCheckpoint {
    return { version: 1, epoch: this.epoch, baseline: this.baseline, limits: this.limits,
      packets: [...packets.values()], coverage: this.coverage };
  }

  private budgetBytes(packets = this.packets): number {
    return Buffer.byteLength(JSON.stringify({ ...this.checkpointValue(packets), coverage: { status: 'complete' } }))
      + CONTINUITY_CONTROL_RESERVE_BYTES;
  }

  private assertBudget(packets: Map<string, ContinuityPacket>): void {
    if (packets.size > this.limits.maxPackets || this.budgetBytes(packets) > this.limits.maxBytes) {
      throw new ContinuityError('LIMIT_EXCEEDED', 'Journal budget exhausted; no evidence was evicted');
    }
  }

  retentionStats() {
    return { checkpointBytes: Buffer.byteLength(JSON.stringify(this.checkpointValue())),
      budgetBytes: this.budgetBytes(), controlReserveBytes: CONTINUITY_CONTROL_RESERVE_BYTES,
      packets: this.packets.size };
  }

  private closure(ids: Iterable<string>, packets = this.packets): Set<string> {
    const result = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) fail('Cyclic event dependencies');
      if (result.has(id)) return;
      const packet = packets.get(id);
      if (!packet) fail('Missing event dependency');
      visiting.add(id);
      packet.parents.forEach(visit);
      visiting.delete(id);
      result.add(id);
    };
    for (const id of ids) visit(id);
    return result;
  }

  private materialize(ids: Iterable<string>, packets = this.packets): Y.Doc {
    const ordered = this.closure(ids, packets);
    return materializeDocHistory(decodeStrictBase64(this.baseline, MAX_DOC_SYNC_PAYLOAD_BYTES),
      [...ordered].map(id => decodeStrictBase64(packets.get(id)!.update, MAX_DOC_UPDATE_BYTES)));
  }

  heads(): string[] {
    const heads = new Set(this.accepted);
    for (const id of this.accepted) for (const parent of this.packets.get(id)!.parents) heads.delete(parent);
    return [...heads].sort();
  }

  currentState(): Uint8Array {
    const doc = this.materialize(this.accepted);
    try { return Y.encodeStateAsUpdate(doc); } finally { doc.destroy(); }
  }

  /** Sticky control state uses the allowance reserved before packet admission. */
  markIncomplete(reason: string): void {
    if (this.coverage.status === 'incomplete') return;
    // Copy only a bounded prefix; never retain a large input or accumulate a log.
    const bounded = typeof reason === 'string'
      ? Array.from(reason.slice(0, 240), char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('').trim() : '';
    this.coverage = { status: 'incomplete', reason: bounded || 'Unspecified coverage loss', knownCut: this.heads() };
  }

  accept(input: ContinuityPacket): { status: 'accepted' | 'pending' | 'duplicate'; accepted: string[] } {
    let packet: ContinuityPacket;
    try { packet = packetSchema.parse(JSON.parse(JSON.stringify(input))); } catch { return fail('Malformed packet'); }
    if (new Set(packet.parents).size !== packet.parents.length || packet.parents.includes(packet.id)) fail('Invalid parent list');
    const duplicate = this.packets.get(packet.id);
    if (duplicate) {
      if (!isDeepStrictEqual(duplicate, packet)) fail('Contradictory duplicate packet');
      return { status: 'duplicate', accepted: [] };
    }
    const staged = new Map(this.packets).set(packet.id, packet);
    this.assertBudget(staged);
    // Validate self-contained evidence even while its causal dependencies are pending.
    const pre = load(packet.before);
    try {
      inspectTargets(Y.encodeStateAsUpdate(pre));
      let pm = projection(pre).doc;
      for (const json of rawSteps(packet)) {
        const applied = Step.fromJSON(editor.pmSchema, json).apply(pm);
        if (!applied.doc) fail('Evidence step does not apply');
        pm = applied.doc;
        pm.check();
      }
      // Check dependencies before serialisation could discard pending structs/deletes.
      const after = materializeDocHistory(Y.encodeStateAsUpdate(pre), [decodeStrictBase64(packet.update, MAX_DOC_UPDATE_BYTES)]);
      try {
        inspectTargets(Y.encodeStateAsUpdate(after));
        if (!pm.eq(projection(after).doc)) fail('Evidence does not match actual Yjs content');
      } finally { after.destroy(); }
    } catch (error) {
      if (error instanceof ContinuityError) throw error;
      fail(`Invalid packet evidence: ${String(error)}`);
    } finally { pre.destroy(); }
    // Detect cycles even when another dependency is still absent.
    const walked = new Set<string>();
    const walk = (id: string, path: Set<string>) => {
      if (path.has(id)) fail('Cyclic event dependencies');
      if (walked.has(id)) return;
      const item = staged.get(id);
      if (item) item.parents.forEach(parent => walk(parent, new Set([...path, id])));
      walked.add(id);
    };
    for (const id of staged.keys()) walk(id, new Set());
    const accepted = new Set(this.accepted);
    const added: string[] = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const item of staged.values()) {
        if (accepted.has(item.id) || !item.parents.every(parent => accepted.has(parent))) continue;
        const expected = this.materialize(item.parents, staged), before = load(item.before);
        try {
          if (bytes(Y.encodeStateAsUpdate(expected)) !== bytes(Y.encodeStateAsUpdate(before))
            || !Y.equalSnapshots(Y.snapshot(expected), Y.snapshot(before))) fail('Preimage does not equal its declared causal state');
        } finally { expected.destroy(); before.destroy(); }
        accepted.add(item.id);
        added.push(item.id);
        progressed = true;
      }
    }
    const frontier = new Set(accepted);
    for (const id of accepted) for (const parent of staged.get(id)!.parents) frontier.delete(parent);
    if (frontier.size > 32) throw new ContinuityError('LIMIT_EXCEEDED', 'Causal frontier budget exhausted');
    const merged = this.materialize(accepted, staged);
    try { inspectTargets(Y.encodeStateAsUpdate(merged)); } finally { merged.destroy(); }
    this.packets = staged;
    this.accepted = accepted;
    return { status: accepted.has(packet.id) ? 'accepted' : 'pending', accepted: added };
  }

  private fresh(doc: Y.Doc, target: TextTargetRef, start: number, end: number): TextTargetRef {
    if (start === end) throw new ContinuityError('TARGET_GONE', 'Current interval is empty');
    const state = Y.encodeStateAsUpdate(doc);
    for (const block of inspectTargets(state)) for (const span of block.spans) {
      if (span.targetRef.container !== target.container || span.targetRef.block.container !== target.block.container) continue;
      const resolved = resolveExperimentalTarget(doc, span.targetRef);
      if (resolved.start <= start && end <= resolved.end) return issueTextSpan(state, span.targetRef, start - resolved.start, end - resolved.start);
    }
    return unknown('Current interval crosses unsupported inline or mark boundaries');
  }

  /** UTF-16 offsets within the indexed nonempty XmlText, not flattened block text. */
  issueSpan(blockId: string, from: number, to: number, inlineIndex = 0): ContinuityReference {
    if (this.coverage.status === 'incomplete') unknown(`Coverage incomplete: ${this.coverage.reason}`);
    if (this.accepted.size !== this.packets.size) unknown('Pending evidence prevents issuance');
    const state = this.currentState();
    const spans = inspectTargets(state).find(block => block.blockId === blockId)?.spans ?? [];
    const containers = [...new Set(spans.map(span => span.targetRef.container))];
    const target = spans.find(span => span.targetRef.container === containers[inlineIndex])?.targetRef;
    if (!target || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= to) unknown('Invalid issuance interval');
    const doc = materializeDocHistory(state, []);
    try {
      const fresh = this.fresh(doc, target, from, to);
      locate(doc, fresh);
      const issuedAt = this.now();
      return { epoch: this.epoch, issuedCut: this.heads(), issuedSnapshot: bytes(Y.encodeSnapshot(Y.snapshot(doc))),
        issuedAt, expiresAt: issuedAt + this.limits.ttlMs, target: fresh };
    } finally { doc.destroy(); }
  }

  evaluate(ref: ContinuityReference, currentState?: string | Uint8Array): ContinuityDecision {
    try {
      if (ref.epoch !== this.epoch || !Number.isFinite(ref.issuedAt) || ref.expiresAt !== ref.issuedAt + this.limits.ttlMs
        || ref.issuedAt > this.now()) unknown('Invalid issuance epoch or time');
      if (this.now() >= ref.expiresAt) return { status: 'expired', reason: 'Reference lifetime elapsed' };
      if (!Array.isArray(ref.issuedCut) || !ref.issuedCut.every(id => this.accepted.has(id))) unknown('Issuance cut is not accepted');
      const issued = this.closure(ref.issuedCut);
      const atIssue = this.materialize(issued);
      try {
        if (bytes(Y.encodeSnapshot(Y.snapshot(atIssue))) !== ref.issuedSnapshot) unknown('Issuance snapshot does not match its cut');
        resolveExperimentalTarget(atIssue, ref.target);
      } finally { atIssue.destroy(); }
      // Later packets may still be retained, but cannot certify passage history across a gap.
      const history = this.coverage.status === 'incomplete' ? this.closure(this.coverage.knownCut) : this.accepted;
      if ([...issued].some(id => !history.has(id))) unknown('Issuance is not covered before the history gap');
      const ordered = [...this.closure([...history].sort())];
      const cuts = new Map(ordered.map(id => [id, this.closure([id])]));
      let uncertainty: string | undefined;
      // Query-local only: at most one derived reference per retained event. null is
      // unknown; undefined is a certified event outside the original inline container.
      const lineages = new Map<string, TextTargetRef | null | undefined>();
      const outsideOnlyAtCut = (cut: Set<string>, current: Y.Doc): TextTargetRef => {
        // Reconcile certified outside-only branches, including successive keys.
        // Derive original item witnesses from issuance, never store them in refs.
        const events = [...cut].filter(id => !issued.has(id));
        const issuance = this.materialize(issued);
        try {
          const original = locate(issuance, ref.target);
          const itemsAt = (doc: Y.Doc) => {
            const live = locate(doc, ref.target, [0, 0]);
            let first = -1;
            for (let index = original.start; index < original.end; index++) {
              const relative = Y.createRelativePositionFromTypeIndex(original.text, index, 0);
              const beforeItem = Y.createAbsolutePositionFromRelativePosition(relative, doc, false);
              const afterItem = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON({
                ...Y.relativePositionToJSON(relative), assoc: -1,
              }), doc, false);
              if (index === original.start && beforeItem) first = beforeItem.index;
              // Deleted items can still resolve. Opposite associations must enclose
              // exactly this original character, with no gaps/imports in the passage.
              if (!relative.item || beforeItem?.type !== live.text || afterItem?.type !== live.text
                || beforeItem.index !== first + index - original.start || afterItem.index !== beforeItem.index + 1) {
                unknown('Original concurrent passage items are missing or noncontiguous');
              }
            }
            if (first < 0) unknown('Concurrent passage is empty');
            return { ...live, start: first, end: first + original.end - original.start };
          };
          for (const id of events) {
            const packet = this.packets.get(id)!;
            const parents = this.closure(packet.parents);
            if ([...issued].some(parent => !parents.has(parent)) || packet.evidence.kind !== 'pm') {
              unknown('Unsupported concurrent outside-edit ancestry');
            }
            const pre = load(packet.before);
            try {
              const passage = itemsAt(pre);
              let pm = passage.pm, start = passage.pmStart + passage.start, end = passage.pmStart + passage.end;
              for (const json of packet.evidence.steps) {
                const step = Step.fromJSON(editor.pmSchema, json);
                if (!(step instanceof ReplaceStep) || classify(pm, step) !== 'text') unknown('Concurrent edit is not plain text');
                const insertion = step.from === step.to && step.slice.size > 0 && (step.from < start || step.from > end);
                const deletion = step.from < step.to && step.slice.size === 0 && (step.to <= start || step.from >= end);
                if (!insertion && !deletion) unknown('Concurrent edit is not strictly outside the passage');
                start = step.getMap().map(start, -1); end = step.getMap().map(end, 1);
                pm = step.apply(pm).doc!;
              }
              Y.applyUpdate(pre, decodeStrictBase64(packet.update, MAX_DOC_UPDATE_BYTES));
              const after = itemsAt(pre);
              if (after.pmStart + after.start !== start || after.pmStart + after.end !== end) {
                unknown('Concurrent passage mapping disagrees with original items');
              }
            } finally { pre.destroy(); }
          }
          const live = itemsAt(current);
          return reanchor(ref.target, live.text, live.start, live.end);
        } finally { issuance.destroy(); }
      };
      const atCut = (cut: Set<string>, doc: Y.Doc): TextTargetRef => {
        if ([...cut].some(id => lineages.has(id) && lineages.get(id) === null)) unknown('Parent lineage is not certified');
        const candidates = [...cut].filter(id => lineages.get(id) != null);
        const heads = candidates.filter(id => !candidates.some(other => other !== id && cuts.get(other)!.has(id)));
        const refs = heads.length ? heads.map(id => lineages.get(id)!) : [ref.target];
        let joined: ReturnType<typeof locate> | undefined;
        for (const candidate of refs) {
          const resolved = locate(doc, candidate);
          if (joined && (joined.start !== resolved.start || joined.end !== resolved.end)) return outsideOnlyAtCut(cut, doc);
          joined = resolved;
        }
        return reanchor(ref.target, joined!.text, joined!.start, joined!.end);
      };
      for (const id of ordered) {
        if (issued.has(id)) continue;
        const packet = this.packets.get(id)!;
        const ancestors = this.closure(packet.parents);
        const causal = [...issued].every(event => ancestors.has(event));
        const pre = load(packet.before);
        lineages.set(id, null);
        try {
          if (packet.evidence.kind !== 'pm') {
            let undoEvent = packet;
            let certified = true;
            // A redo cannot turn an uncertified undo into trusted provenance.
            while (undoEvent.evidence.kind !== 'pm') {
              const source = undoEvent.evidence.sourceId ? this.packets.get(undoEvent.evidence.sourceId) : undefined;
              if (!source || !this.closure(undoEvent.parents).has(source.id)) { certified = false; break; }
              const sourceDoc = load(source.before), undoBefore = load(undoEvent.before);
              try {
                let pm = projection(sourceDoc).doc;
                const inverses: unknown[] = [];
                for (const json of rawSteps(source)) {
                  const step = Step.fromJSON(editor.pmSchema, json);
                  inverses.unshift(step.invert(pm).toJSON());
                  pm = step.apply(pm).doc!;
                }
                Y.applyUpdate(sourceDoc, decodeStrictBase64(source.update, MAX_DOC_UPDATE_BYTES));
                const sourcePost = Y.encodeStateAsUpdate(sourceDoc);
                const compatible = bytes(sourcePost) === bytes(Y.encodeStateAsUpdate(undoBefore))
                  || hasCancelledInsertion(Y, source, sourcePost, undoEvent.before, undoEvent.parents, id => this.packets.get(id));
                if (!isDeepStrictEqual(JSON.parse(JSON.stringify(inverses)), undoEvent.evidence.sourceSteps)
                  || !compatible) { certified = false; break; }
              } finally { sourceDoc.destroy(); undoBefore.destroy(); }
              undoEvent = source;
            }
            if (!certified) continue;
          }
          const inherited = causal ? atCut(ancestors, pre) : ref.target;
          const located = locate(pre, inherited, causal ? undefined : [0, 0]);
          const decision = checkSteps(located.pm, rawSteps(packet),
            located.pmStart + (causal ? located.start : 0), located.pmStart + (causal ? located.end : located.text.length),
            located.pmStart, located.pmStart + located.text.length, !causal);
          if (decision.status === 'broken') return { status: 'broken', reason: 'Accepted structural operation broke this passage', eventId: id };
          if (decision.status === 'unknown') continue;
          if (!causal) { lineages.set(id, undefined); continue; }
          // All pre-event checks are complete. Reuse this query-local document;
          // the outer finally owns it through both states, including rejection.
          applyResolvedDocUpdate(pre, decodeStrictBase64(packet.update, MAX_DOC_UPDATE_BYTES));
          const post = pre;
          const after = locate(post, ref.target, [0, 0]);
          const start = decision.start - after.pmStart, end = decision.end - after.pmStart;
          const mapped = reanchor(ref.target, after.text, start, end);
          // Deleted anchors may be replaced by the certified PM location. A live
          // anchor must agree: final-string reconciliation can delete the wrong a.
          for (const [encoded, assoc, index] of [[inherited.start, -1, start], [inherited.end, 0, end]] as const) {
            const relative = position(encoded, assoc);
            const absolute = Y.createAbsolutePositionFromRelativePosition(relative, post, false);
            const other = relative.item === null ? null : Y.createAbsolutePositionFromRelativePosition(
              Y.createRelativePositionFromJSON({ ...Y.relativePositionToJSON(relative), assoc: assoc < 0 ? 0 : -1 }), post, false);
            const survives = relative.item === null || (absolute?.type === after.text && other?.type === after.text
              && Math.abs(absolute.index - other.index) === 1);
            if (survives && (absolute?.type !== after.text || absolute.index !== index)) unknown('PM mapping disagrees with a surviving Yjs boundary');
          }
          // A different-container branch carries no competing location opinion:
          // its old anchors may have been collected by a relevant concurrent edit.
          lineages.set(id, decision.touched ? mapped : undefined);
        } catch (error) {
          // Keep inspecting independent branches even when this lineage is unknown.
          uncertainty ??= String(error);
        } finally { pre.destroy(); }
      }
      if (this.coverage.status === 'incomplete') return { status: 'unknown', reason: `Coverage incomplete: ${this.coverage.reason}` };
      // History precedes current identity: structural undo cannot revive a broken ref.
      const current = this.materialize(this.accepted);
      try {
        if (currentState !== undefined) {
          const supplied = load(typeof currentState === 'string' ? currentState : bytes(currentState));
          try {
            if (bytes(Y.encodeStateAsUpdate(supplied)) !== bytes(Y.encodeStateAsUpdate(current))
              || !Y.equalSnapshots(Y.snapshot(supplied), Y.snapshot(current))) unknown('Current state is not covered by the journal');
          } finally { supplied.destroy(); }
        }
        locate(current, ref.target, [0, 0]);
        const incomplete = this.accepted.size !== this.packets.size || [...lineages.values()].some(value => value === null);
        if (incomplete) return { status: 'unknown', reason: uncertainty ?? 'Evidence, causality, or operation shape is not certified' };
        const located = locate(current, atCut(this.accepted, current));
        if (located.start === located.end) return { status: 'gone', reason: 'Current interval is empty' };
        this.fresh(current, ref.target, located.start, located.end);
        return { status: 'safe', start: located.start, end: located.end };
      } finally { current.destroy(); }
    } catch (error) {
      const gone = (error instanceof ContinuityError && error.code === 'TARGET_GONE')
        || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'TARGET_GONE');
      return { status: gone ? 'gone' : 'unknown', reason: String(error) };
    }
  }

  apply(ref: ContinuityReference, text: string, currentState?: string | Uint8Array) {
    const decision = this.evaluate(ref, currentState);
    if (decision.status !== 'safe') throw new ContinuityError('UNKNOWN', `Patch refused: ${decision.status}: ${decision.reason}`);
    const state = this.currentState(), doc = materializeDocHistory(state, []);
    try {
      const located = locate(doc, ref.target, [decision.start, decision.end]);
      const fresh = this.fresh(doc, ref.target, located.start, located.end);
      const result = applyTargetPatch(state, [{ type: 'replace_text', targetRef: fresh, text }]);
      const from = located.pmStart + located.start, to = located.pmStart + located.end;
      const marks = located.pm.resolve(from).nodeAfter?.marks ?? [];
      const tr = new Transform(located.pm).replaceWith(from, to, text ? editor.pmSchema.text(text, marks) : []);
      const packet: ContinuityPacket = { id: randomUUID(), parents: this.heads(), before: bytes(state), update: bytes(result.update),
        evidence: { kind: 'pm', steps: tr.steps.map(step => step.toJSON()) } };
      this.accept(packet);
      return { ...result, packet };
    } finally { doc.destroy(); }
  }

  checkpoint(): ContinuityCheckpoint {
    return structuredClone(this.checkpointValue());
  }

  static fromCheckpoint(value: ContinuityCheckpoint, options: Pick<ContinuityOptions, 'now'> = {}): ContinuityJournal {
    if (value.version !== 1 || !key.safeParse(value.epoch).success || !Array.isArray(value.packets)) fail('Invalid checkpoint');
    const coverage = coverageSchema.safeParse(value.coverage);
    if (!coverage.success) fail('Invalid checkpoint coverage');
    const journal = new ContinuityJournal(value.baseline, { ...value.limits, ...options });
    journal.epoch = value.epoch;
    journal.coverage = coverage.data;
    journal.assertBudget(journal.packets);
    for (const packet of value.packets) journal.accept(packet);
    if (coverage.data.status === 'incomplete' && !coverage.data.knownCut.every(id => journal.accepted.has(id))) fail('Invalid checkpoint coverage frontier');
    return journal;
  }
}
