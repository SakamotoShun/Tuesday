/** Isolated PostgreSQL/real-WebSocket scheduling comparison; never run against production. */
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import * as Y from 'yjs';
import { db, client } from '../db/client';
import { activityLogs, docs, users } from '../db/schema';
import { ensureIntegrationDb, seedDoc, seedUser } from '../test/integration';
import { DocCollabRepository, applyCurrentSpan, issueCurrentSpan } from '../repositories/docCollab';
import { searchRepository } from '../repositories/search';
import { collab, setCollabDependenciesForTests } from '../routes/collab';
import { websocket } from '../websocket';

if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true') throw new Error('An isolated integration database is required');
const mode = process.argv[2];
if (mode !== 'queue' && mode !== 'per-update') throw new Error('Usage: docProjectionLoad.ts queue|per-update');
// Declared before measurement; diagnostic budgets, not production SLOs.
const budgets = { ackP95Ms: 500, readP95Ms: 500, searchP95Ms: 500, patchP95Ms: 1000,
  repairP95Ms: 1000, discoveryLagMs: 1500, sampledRssGrowthMiB: 256 };
const metrics: Record<string, number[]> = {};
async function measure<T>(name: string, operation: () => Promise<T>) {
  const start = performance.now();
  try { return await operation(); } finally { (metrics[name] ??= []).push(performance.now() - start); }
}
class Repository extends DocCollabRepository {
  override appendUpdate(...args: Parameters<DocCollabRepository['appendUpdate']>) {
    return measure('persistence', () => super.appendUpdate(args[0], args[1], args[2], { ...args[3], project: mode === 'per-update' }));
  }
}
const repository = new Repository();
await ensureIntegrationDb();
const owner = await seedUser({ role: 'member', employmentType: 'hourly' });
const user = { ...owner, role: 'member' as const, employmentType: 'hourly' as const };
const content = [{ id: 'phrase', type: 'paragraph', content: [{ type: 'text', text: 'before TARGET after', styles: {} }], children: [] }];
const stored = await seedDoc(null, user.id, { content });
const patchDoc = await seedDoc(null, user.id, { content });
setCollabDependenciesForTests({ validateSession: async key => key === 'projection-load' ? user : null, docCollabRepository: repository });
const app = new Hono();
app.route('/collab', collab);
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: (request, srv) => app.fetch(request, { server: srv }), websocket });
type Peer = { doc: Y.Doc; ws: WebSocket; generation: string; pending: Array<{ resolve: () => void; reject: (e: Error) => void }> };
const peers: Peer[] = [];
const errors: string[] = [];
async function connect(): Promise<Peer> {
  return measure('sync', () => new Promise((resolve, reject) => {
    const peer: Peer = { doc: new Y.Doc(), generation: '', pending: [],
      ws: new WebSocket(`ws://127.0.0.1:${server.port}/collab/docs/${stored.id}`, { headers: { Cookie: 'session_id=projection-load' } }) };
    const timer = setTimeout(() => reject(new Error('Initial sync timeout')), 10_000);
    peer.ws.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'doc.sync') {
        if (message.snapshot) Y.applyUpdate(peer.doc, Buffer.from(message.snapshot, 'base64'));
        for (const update of message.updates) Y.applyUpdate(peer.doc, Buffer.from(update, 'base64'));
        peer.generation = message.generation;
        clearTimeout(timer);
        resolve(peer);
      } else if (message.type === 'doc.update') Y.applyUpdate(peer.doc, Buffer.from(message.update, 'base64'));
      else if (message.type === 'doc.ack') peer.pending.shift()?.resolve();
      else if (message.type === 'ping') peer.ws.send(JSON.stringify({ type: 'pong', ts: message.ts }));
      else if (message.type === 'error') {
        errors.push(JSON.stringify(message));
        peer.pending.splice(0).forEach(wait => wait.reject(new Error(message.code)));
        clearTimeout(timer);
        reject(new Error(message.code));
      }
      // Deliberately no browser snapshots: server read/repair must project content.
    };
    peer.ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket failed')); };
  }));
}
async function type(peer: Peer, inserted = 'x') {
  const before = Y.encodeStateVector(peer.doc);
  const text = [...peer.doc.getXmlFragment('prosemirror').createTreeWalker(node => node instanceof Y.XmlText)][0] as Y.XmlText;
  text.insert(text.length, inserted);
  return measure('ack', () => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ACK timeout')), 10_000);
    peer.pending.push({ resolve: () => { clearTimeout(timer); resolve(); }, reject });
    peer.ws.send(JSON.stringify({ type: 'doc.update', generation: peer.generation,
      operationId: crypto.randomUUID(),
      update: Buffer.from(Y.encodeStateAsUpdate(peer.doc, before)).toString('base64') }));
  }));
}
async function disconnect(peer: Peer) {
  await new Promise<void>(resolve => { peer.ws.addEventListener('close', () => resolve(), { once: true }); peer.ws.close(); });
  peer.doc.destroy();
}
let sampledLockWaiters = 0, peakRss = process.memoryUsage().rss, baselineRss = peakRss;
let sampling = false;
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  if (sampling) return;
  sampling = true;
  void db.execute(sql`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`)
    .then(rows => { sampledLockWaiters = Math.max(sampledLockWaiters, Number(rows[0]?.count ?? 0)); })
    .finally(() => { sampling = false; });
}, 10);
try {
  peers.push(...await Promise.all(Array.from({ length: 20 }, connect)));
  baselineRss = process.memoryUsage().rss;
  peakRss = baselineRss;
  const initial = await repository.projectCurrent(stored.id);
  const issued = await db.transaction(tx => issueCurrentSpan(tx, patchDoc.id, 'phrase', 7, 13));
  for (let round = 0; round < 10; round++) {
    const work: Promise<unknown>[] = peers.map(peer => type(peer));
    work.push(measure('read', () => repository.projectCurrent(stored.id)));
    work.push(measure('search', () => searchRepository.searchDocs(user.id, user.role, 'TARGET', 20)));
    if (round % 2 === 0) {
      work.push(measure('compaction', () => repository.compactCurrent(stored.id)));
      work.push(measure('patch', () => db.transaction(tx => applyCurrentSpan(tx, {
        docId: patchDoc.id, generation: issued.generation, reference: issued.reference, text: 'AGENT!', actorId: user.id,
      }))));
    }
    if (mode === 'queue') work.push(measure('repair', () => repository.refreshProjections()));
    await Promise.all(work);
    if (round === 4) {
      await disconnect(peers[0]!);
      peers[0] = await connect();
    }
  }
  await measure('repair', () => repository.refreshProjections());
  const current = await measure('read', () => repository.projectCurrent(stored.id));
  assert.equal(current.doc.searchText, 'before TARGET after' + 'x'.repeat(200));
  await Bun.sleep(20);
  for (const peer of peers) assert.deepEqual(Buffer.from(Y.encodeStateAsUpdate(peer.doc)), Buffer.from(current.state));
  // Separate final-edit probe: no current read may force projection. Start a
  // one-second refresh tick just after ACK (worst tick phase for this empty queue).
  await type(peers[0]!, ' discoveryprobe ');
  const acknowledgedAt = performance.now();
  let repairFailure: unknown;
  let repair: Promise<unknown> | undefined;
  const tick = setTimeout(() => {
    repair = repository.refreshProjections().catch(error => { repairFailure = error; });
  }, 1000);
  let found = false;
  try {
    while (performance.now() - acknowledgedAt < 5000) {
      if (repairFailure) throw repairFailure;
      const results = await searchRepository.searchDocs(user.id, user.role, 'discoveryprobe', 20);
      if (results.some(doc => doc.id === stored.id)) { found = true; break; }
      await Bun.sleep(20);
    }
  } finally { clearTimeout(tick); await repair; }
  const discoveryLagMs = performance.now() - acknowledgedAt;
  assert.ok(found, 'Server refresh must make the final edit discoverable without a browser snapshot or current read');
  assert.deepEqual(errors, []);
  const timings = Object.fromEntries(Object.entries(metrics).map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [name, { count: values.length, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1]!, maxMs: sorted.at(-1)! }];
  }));
  const sampledRssGrowthMiB = (peakRss - baselineRss) / 1024 / 1024;
  console.log(JSON.stringify({ mode, clients: 20, updates: 200, discoveryProbeUpdates: 1, reconnects: 1, budgets, timings, discoveryLagMs,
    sampledLockWaiters, sampledRssGrowthMiB, projectionContentWrites: current.doc.version - initial.doc.version,
    breaches: [timings.ack!.p95Ms > budgets.ackP95Ms && 'ack', timings.read!.p95Ms > budgets.readP95Ms && 'read',
      timings.patch!.p95Ms > budgets.patchP95Ms && 'patch', timings.repair!.p95Ms > budgets.repairP95Ms && 'repair',
      timings.search!.p95Ms > budgets.searchP95Ms && 'search', discoveryLagMs > budgets.discoveryLagMs && 'discovery',
      sampledRssGrowthMiB > budgets.sampledRssGrowthMiB && 'memory'].filter(Boolean) }, null, 2));
} finally {
  clearInterval(sampler);
  while (sampling) await Bun.sleep(5);
  await Promise.all(peers.filter(peer => peer.ws.readyState === WebSocket.OPEN).map(disconnect));
  server.stop(true);
  setCollabDependenciesForTests(null);
  await db.delete(activityLogs).where(eq(activityLogs.actorId, user.id));
  await db.delete(docs).where(eq(docs.createdBy, user.id));
  await db.delete(users).where(eq(users.id, user.id));
  await client.end();
}
