import type * as Yjs from 'yjs';

interface Packet {
  id: string;
  parents: string[];
  before: string;
  update: string;
  evidence: { kind: 'pm'; steps: unknown[] }
    | { kind: 'undo' | 'redo'; sourceId?: string; sourceSteps: unknown[] };
}

/**
 * Local experiment only: permit one serial insertion/undo pair between a source
 * and its inverse. No remapping, grouped history, pruning or concurrent ancestry.
 * Inject the installed Yjs runtime so the browser and backend use their own copy.
 */
export function hasCancelledInsertion(
  Y: typeof Yjs, source: Packet, sourcePost: Uint8Array, before: string,
  parents: string[], getPacket: (id: string) => Packet | undefined,
): boolean {
  if (parents.length !== 1) return false;
  const inverse = getPacket(parents[0]!);
  if (!inverse || inverse.parents.length !== 1 || inverse.evidence.kind !== 'undo') return false;
  const insertion = getPacket(inverse.parents[0]!);
  if (!insertion || insertion.parents.length !== 1 || insertion.parents[0] !== source.id
    || inverse.evidence.sourceId !== insertion.id || insertion.evidence.kind !== 'pm'
    || insertion.evidence.steps.length !== 1) return false;
  const step = insertion.evidence.steps[0] as {
    stepType?: string; from?: number; to?: number;
    slice?: { openStart?: number; openEnd?: number; content?: Array<{ type?: string; text?: string }> };
  } | null;
  const content = step?.slice?.content;
  if (step?.stepType !== 'replace' || !Number.isSafeInteger(step.from) || step.from! < 0 || step.to !== step.from
    || (step.slice?.openStart ?? 0) !== 0 || (step.slice?.openEnd ?? 0) !== 0
    || content?.length !== 1 || content[0]?.type !== 'text' || typeof content[0].text !== 'string'
    || content[0].text.length === 0) return false;
  const expected = { stepType: 'replace', from: step.from, to: step.from! + content[0].text.length };
  if (JSON.stringify(inverse.evidence.sourceSteps) !== JSON.stringify([expected])) return false;

  const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index]);
  const canonical = (doc: Yjs.Doc) => {
    const copy = new Y.Doc();
    try { Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); return Y.encodeStateAsUpdate(copy); }
    finally { copy.destroy(); }
  };
  const doc = new Y.Doc();
  let undo: Yjs.UndoManager | undefined;
  try {
    // Packet adjacency is checked above; all four binary endpoints must agree.
    if (!equal(sourcePost, decode(insertion.before))) return false;
    Y.applyUpdate(doc, sourcePost);
    const deletions = Y.snapshot(doc).ds;
    const origin = Symbol('verify-insertion');
    undo = new Y.UndoManager(doc.getXmlFragment('prosemirror'), { trackedOrigins: new Set([origin]) });
    Y.applyUpdate(doc, decode(insertion.update), origin);
    if (!Y.equalDeleteSets(deletions, Y.snapshot(doc).ds)
      || !equal(canonical(doc), decode(inverse.before))) return false;
    const vector = Y.encodeStateVector(doc);
    // The insertion cannot delete original items; its undo must only delete the
    // newly inserted items. Recreating an old item would advance a client clock.
    if (!undo.undo() || !equal(vector, Y.encodeStateVector(doc))) return false;
    const cancelled = canonical(doc);
    const actual = new Y.Doc();
    try {
      Y.applyUpdate(actual, decode(inverse.before));
      Y.applyUpdate(actual, decode(inverse.update));
      return equal(cancelled, canonical(actual)) && equal(cancelled, decode(before));
    } finally { actual.destroy(); }
  } catch { return false; }
  finally { undo?.destroy(); doc.destroy(); }
}
