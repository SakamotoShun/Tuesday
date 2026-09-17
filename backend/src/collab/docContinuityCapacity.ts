import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BlockNoteEditor } from '@blocknote/core';
import { blocksToYDoc, yDocToBlocks } from '@blocknote/core/yjs';
import { Step, Transform } from 'prosemirror-transform';
import { initProseMirrorDoc, updateYFragment, ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { ContinuityError, ContinuityJournal, type ContinuityPacket } from './docContinuityExperiment';
import { docTargetSchema } from './docTargetSchema';

// One isolated, persistent worker per fixture. Module startup is outside timings.
// Run: bun run src/collab/docContinuityCapacity.ts 32 0 (or 64 150000).
// Append --profile-memory=observe for phase boundaries, or --profile-memory=gc
// for a separate forced-collection diagnostic (never operating-envelope evidence).
const maxPackets = Number(process.argv[2] ?? 32);
const outsideLength = Number(process.argv[3] ?? 0);
const memoryMode = process.argv[4] ?? 'off';
assert([32, 64, 128].includes(maxPackets));
assert([0, 150_000].includes(outsideLength));
assert(['off', '--profile-memory=observe', '--profile-memory=gc'].includes(memoryMode));
const profiling = memoryMode !== 'off';
const collectBetweenPhases = memoryMode === '--profile-memory=gc';
const editor = BlockNoteEditor.create({ schema: docTargetSchema });
const initial = blocksToYDoc(editor, [
  { id: 'p', type: 'paragraph', content: 'before TARGET after' },
  { id: 'a', type: 'paragraph', content: [{ type: 'text', text: 'Writer A:', styles: { bold: true } }] },
  { id: 'b', type: 'paragraph', content: 'Writer B:' },
  ...(outsideLength ? [{ id: 'large', type: 'paragraph' as const, content: 'x'.repeat(outsideLength) }] : []),
]);
const encode = (data: Uint8Array) => Buffer.from(data).toString('base64');
const canonical = (doc: Y.Doc) => {
  const copy = new Y.Doc();
  try { Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); return Y.encodeStateAsUpdate(copy); }
  finally { copy.destroy(); }
};
const root = (doc: Y.Doc) => doc.getXmlFragment('prosemirror');
const writers = [new Y.Doc(), new Y.Doc()];
writers.forEach(doc => Y.applyUpdate(doc, Y.encodeStateAsUpdate(initial)));
initial.destroy();
const undos = writers.map(doc => new Y.UndoManager(root(doc), { trackedOrigins: new Set([ySyncPluginKey]) }));
const journal = new ContinuityJournal(canonical(writers[0]), { maxPackets });
const samples: Record<string, number[]> = {};
// Diagnostic GC changes scheduling and latency. Never compare its timings to the
// operating-envelope gates. Observation mode does not force collection.
if (collectBetweenPhases) Bun.gc(true);
const memoryBaseline = process.memoryUsage();
const peak = { heapUsed: memoryBaseline.heapUsed, rss: memoryBaseline.rss };
const linuxPeakRss = () => Number(/^VmHWM:\s+(\d+)/m.exec(readFileSync('/proc/self/status', 'utf8'))?.[1]) * 1024;
const sampleMemory = () => {
  const memory = process.memoryUsage();
  peak.heapUsed = Math.max(peak.heapUsed, memory.heapUsed);
  peak.rss = Math.max(peak.rss, memory.rss);
  return { heapUsed: memory.heapUsed, rss: memory.rss, external: memory.external, arrayBuffers: memory.arrayBuffers };
};
type MemorySample = ReturnType<typeof sampleMemory>;
const memoryPhases: { name: string; cycle: number; before: MemorySample; after: MemorySample;
  afterGc?: MemorySample; highWaterIncreaseBytes: number; durationMs: number }[] = [];
function phase<T>(name: string, run: () => T, recordTiming = false): T {
  if (collectBetweenPhases) Bun.gc(true);
  const before = profiling ? sampleMemory() : undefined;
  const highWaterBefore = profiling ? linuxPeakRss() : 0;
  const start = performance.now();
  try { return run(); }
  finally {
    const durationMs = performance.now() - start;
    if (recordTiming) (samples[name] ??= []).push(durationMs);
    const after = sampleMemory();
    if (before) {
      const highWaterIncreaseBytes = Math.max(0, linuxPeakRss() - highWaterBefore);
      if (collectBetweenPhases) Bun.gc(true);
      memoryPhases.push({ name, cycle: cycles, before, after, afterGc: collectBetweenPhases ? sampleMemory() : undefined,
        highWaterIncreaseBytes, durationMs });
    }
  }
}
const timed = <T>(name: string, run: () => T): T => phase(name, run, true);
let cycles = 0;
const outside = (doc: Y.Doc) => yDocToBlocks(editor, doc).filter(block => block.id !== 'p');
const beforeOutside = outside(writers[0]);
const identities = [...root(writers[0]).createTreeWalker(() => true)].flatMap(node => {
  const positions = node instanceof Y.XmlText ? [...new Set([0, Math.floor(node.length / 2), node.length])] : [0];
  return positions.map(index => ({ position: Y.createRelativePositionFromTypeIndex(node, index, -1), index }));
});
const original = timed('issue', () => journal.issueSpan('p', 7, 13));
let fresh = original;
let sequence = 0;
let refusalPhase = '';
let refusedCandidateBytes = 0;
const measurements: object[] = [];
const sync = (update: Uint8Array) => phase('relay', () => writers.forEach(doc => Y.applyUpdate(doc, update, 'relay')));
function accept(packet: ContinuityPacket) {
  const { before, state } = phase('verificationSnapshot', () => ({ before: journal.checkpoint(), state: journal.currentState() }));
  try { timed('admission', () => journal.accept(packet)); }
  catch (error) {
    if (!(error instanceof ContinuityError) || error.code !== 'LIMIT_EXCEEDED') throw error;
    phase('refusalVerification', () => {
      assert.deepEqual(journal.checkpoint(), before);
      assert.deepEqual(journal.currentState(), state);
    });
    refusedCandidateBytes = Buffer.byteLength(JSON.stringify(packet));
    return false;
  }
  sync(Buffer.from(packet.update, 'base64'));
  return true;
}
const safe = () => {
  for (const [name, ref] of [['resolveOriginal', original], ['resolveFresh', fresh]] as const) {
    assert.deepEqual(timed(name, () => journal.evaluate(ref)), { status: 'safe', start: 7, end: 13 });
  }
};
try {
  for (;;) {
    const writer = writers[cycles % 2], undo = undos[cycles % 2];
    undo.stopCapturing();
    const source = timed('syntheticCapture', () => {
      const before = encode(canonical(writer)), vector = Y.encodeStateVector(writer);
      const pm = initProseMirrorDoc(root(writer), editor.pmSchema);
      let offset = -1;
      pm.doc.descendants((node, pos) => { if (node.type.name === 'blockContainer' && node.attrs.id === (cycles % 2 ? 'b' : 'a')) offset = pos + 2; });
      assert(offset >= 0);
      const tr = new Transform(pm.doc).insert(offset, editor.pmSchema.text('X'));
      updateYFragment(writer, root(writer), tr.doc, pm.meta);
      return { id: `edit-${++sequence}`, parents: journal.heads(), before,
        update: encode(Y.encodeStateAsUpdate(writer, vector)), evidence: { kind: 'pm' as const, steps: tr.steps.map(step => step.toJSON()) } };
    });
    if (!accept(source)) { refusalPhase = 'human-insertion'; break; }
    // This reference depends on undo evidence whose source predates its issuance.
    fresh = timed('issue', () => journal.issueSpan('p', 7, 13));
    const undone = timed('syntheticCapture', () => {
      const before = encode(canonical(writer)), vector = Y.encodeStateVector(writer);
      const pre = new Y.Doc();
      let sourceSteps: unknown[];
      try {
        Y.applyUpdate(pre, Buffer.from(source.before, 'base64'));
        const pm = initProseMirrorDoc(root(pre), editor.pmSchema).doc;
        sourceSteps = [Step.fromJSON(editor.pmSchema, source.evidence.steps[0]).invert(pm).toJSON()];
      } finally { pre.destroy(); }
      assert(undo.undo());
      return { id: `undo-${++sequence}`, parents: journal.heads(), before,
        update: encode(Y.encodeStateAsUpdate(writer, vector)), evidence: { kind: 'undo' as const, sourceId: source.id, sourceSteps } };
    });
    if (!accept(undone)) { refusalPhase = 'native-undo'; break; }
    safe();
    const { before, state } = phase('verificationSnapshot', () => ({ before: journal.checkpoint(), state: journal.currentState() }));
    let result: ReturnType<ContinuityJournal['apply']>;
    try { result = timed('patch', () => journal.apply(fresh, 'AGENT!')); }
    catch (error) {
      if (!(error instanceof ContinuityError) || error.code !== 'LIMIT_EXCEEDED') throw error;
      phase('refusalVerification', () => {
        assert.deepEqual(journal.checkpoint(), before);
        assert.deepEqual(journal.currentState(), state);
      });
      refusalPhase = 'agent-patch';
      break;
    }
    sync(result.update);
    cycles++;
    safe();
    phase('convergenceVerification', () => { for (const writer of writers) {
      assert.deepEqual(canonical(writer), journal.currentState());
      assert.deepEqual(outside(writer), beforeOutside);
      // Outside containers and sampled character identities must still resolve.
      const phrase = [...root(writer).createTreeWalker(() => true)].find(node => node instanceof Y.XmlElement && node.getAttribute('id') === 'p');
      for (const anchor of identities) {
        const position = Y.createAbsolutePositionFromRelativePosition(anchor.position, writer, false);
        assert(position);
        if (position.type !== phrase && position.type.parent !== phrase && position.type.parent?.parent !== phrase) assert.equal(position.index, anchor.index);
      }
    } });
    phase('retentionMeasurement', () => measurements.push({ cycles, ...journal.retentionStats(), stateBytes: journal.currentState().byteLength }));
  }
  safe();
  const checkpoint = phase('finalCheckpointCopy', () => journal.checkpoint());
  const serialized = phase('checkpointSerialization', () => JSON.stringify(checkpoint));
  for (let i = 0; i < 3; i++) {
    const reloaded = timed('reload', () => ContinuityJournal.fromCheckpoint(JSON.parse(serialized)));
    phase('reloadVerification', () => {
      assert.deepEqual(reloaded.evaluate(original), { status: 'safe', start: 7, end: 13 });
      assert.deepEqual(reloaded.evaluate(fresh), { status: 'safe', start: 7, end: 13 });
      assert.deepEqual(reloaded.currentState(), journal.currentState());
    });
  }
  // Human state keeps converging after an evidence refusal, while all agent entry
  // points fail closed once the missing operation is recorded as coverage loss.
  sync(Y.encodeStateAsUpdate(writers[0]));
  sync(Y.encodeStateAsUpdate(writers[1]));
  journal.markIncomplete(`Capacity exhausted at ${refusalPhase}`);
  for (const [index, writer] of writers.entries()) {
    const block = [...root(writer).createTreeWalker(() => true)].find(node => node instanceof Y.XmlElement && node.getAttribute('id') === (index ? 'b' : 'a')) as Y.XmlElement;
    const text = [...block.createTreeWalker(node => node instanceof Y.XmlText)][0] as Y.XmlText;
    writer.transact(() => text.insert(text.length, '!'), 'relay');
    sync(Y.encodeStateAsUpdate(writer));
  }
  assert.equal(journal.evaluate(original).status, 'unknown');
  assert.throws(() => journal.issueSpan('p', 7, 13), /Coverage incomplete/);
  const lost = journal.checkpoint();
  assert.throws(() => journal.apply(fresh, 'wrong'), /Patch refused/);
  assert.deepEqual(journal.checkpoint(), lost);
  assert.deepEqual(canonical(writers[0]), canonical(writers[1]));
  const phaseSummaries = Object.fromEntries([...new Set(memoryPhases.map(entry => entry.name))].map(name => {
    const entries = memoryPhases.filter(entry => entry.name === name);
    return [name, { count: entries.length,
      maxHeapIncreaseBytes: Math.max(...entries.map(entry => entry.after.heapUsed - entry.before.heapUsed)),
      maxRssIncreaseBytes: Math.max(...entries.map(entry => entry.after.rss - entry.before.rss)),
      maxExternalIncreaseBytes: Math.max(...entries.map(entry => entry.after.external - entry.before.external)),
      maxHeapAfterBytes: Math.max(...entries.map(entry => entry.after.heapUsed)),
      maxRssAfterBytes: Math.max(...entries.map(entry => entry.after.rss)),
      highWaterIncreaseBytes: entries.reduce((sum, entry) => sum + entry.highWaterIncreaseBytes, 0),
      ...(collectBetweenPhases ? {
        // Bun can refresh heap accounting during GC: a negative reported drop
        // does not mean GC allocated that much. Compare collected endpoints too.
        maxReportedHeapDropBytes: Math.max(...entries.map(entry => entry.after.heapUsed - entry.afterGc!.heapUsed)),
        maxPostGcHeapDeltaBytes: Math.max(...entries.map(entry => entry.afterGc!.heapUsed - entry.before.heapUsed)),
        maxHeapAfterGcBytes: Math.max(...entries.map(entry => entry.afterGc!.heapUsed)),
      } : {}),
    }];
  }));
  const checkpointIndex = memoryPhases.findIndex(entry => entry.name === 'finalCheckpointCopy');
  const reloadEndIndex = memoryPhases.map(entry => entry.name).lastIndexOf('reloadVerification') + 1;
  const segmentSummaries = Object.fromEntries(Object.entries({
    warmBeforeReload: memoryPhases.slice(0, checkpointIndex),
    checkpointAndReload: memoryPhases.slice(checkpointIndex, reloadEndIndex),
  }).map(([name, entries]) => {
    const points = entries.flatMap(entry => [entry.before, entry.after, ...(entry.afterGc ? [entry.afterGc] : [])]);
    return [name, points.length ? {
      sampledHeapDeltaBytes: Math.max(...points.map(point => point.heapUsed)) - memoryBaseline.heapUsed,
      sampledRssDeltaBytes: Math.max(...points.map(point => point.rss)) - memoryBaseline.rss,
    } : null];
  }));
  const summaries = Object.fromEntries(Object.entries(samples).map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [name, { count: values.length, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) }];
  }));
  const thresholds = { admission: 50, issue: 100, resolveOriginal: 100, resolveFresh: 100, patch: 100, reload: 2000 };
  const breaches = Object.entries(thresholds).filter(([name, threshold]) => summaries[name]?.p95Ms > threshold).map(([name]) => name);
  const memory = { sampledHeapDeltaBytes: peak.heapUsed - memoryBaseline.heapUsed,
    sampledRssDeltaBytes: peak.rss - memoryBaseline.rss, processPeakRssBytes: linuxPeakRss(),
    baselineRssBytes: memoryBaseline.rss };
  if (Math.max(memory.sampledHeapDeltaBytes, memory.sampledRssDeltaBytes) > 128 * 1024 * 1024) breaches.push('sampledMemory');
  console.log(JSON.stringify({ maxPackets, outsideLength, cycles, refusalPhase, refusedCandidateBytes,
    retention: journal.retentionStats(), stateBytes: journal.currentState().byteLength,
    preimageBytes: checkpoint.packets.reduce((sum, packet) => sum + Buffer.byteLength(packet.before), 0),
    updateBytes: checkpoint.packets.reduce((sum, packet) => sum + Buffer.byteLength(packet.update), 0),
    stepsBytes: checkpoint.packets.reduce((sum, packet) => sum + Buffer.byteLength(JSON.stringify(packet.evidence)), 0),
    timings: summaries, memory, breaches: collectBetweenPhases ? null : breaches, measurements,
    ...(profiling ? { memoryProfile: { mode: memoryMode, baseline: memoryBaseline, segments: segmentSummaries, phases: phaseSummaries, events: memoryPhases,
      scope: 'Synchronous operation boundaries and new Linux process high-water increments; not allocation totals or per-operation peaks. Heap accounting can refresh during GC. GC mode is diagnostic only.' } } : {}),
  }, null, 2));
} finally {
  undos.forEach(undo => undo.destroy());
  writers.forEach(doc => doc.destroy());
}
