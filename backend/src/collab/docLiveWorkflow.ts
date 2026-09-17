/** Disposable combined-browser harness. Never imported by the application. */
import { createInterface } from 'node:readline';
import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { db, client } from '../db/client';
import { docs, users, projects, docCollabContinuity, mcpIdempotencyKeys } from '../db/schema';
import { ensureIntegrationDb, seedUser, seedSession, seedProject, seedProjectMember, seedDoc } from '../test/integration';
import { collab } from '../routes/collab';
import { websocket } from '../websocket';
import { mcp } from '../routes/mcp';
import { docCollabRepository } from '../repositories/docCollab';
import { mcpTokenService } from '../services/mcpToken';
import { readCurrentDocHistory } from '../repositories/docCollabHistory';

if (process.env.NODE_ENV !== 'test' || process.env.RUN_DB_INTEGRATION_TESTS !== 'true') throw new Error('Requires explicit isolated integration environment');
await ensureIntegrationDb();
const userIds: string[] = [], projectIds: string[] = [], docIds: string[] = [];
const app = new Hono();
app.route('/api/v1/collab', collab);
app.route('/mcp', mcp);
const server = Bun.serve({ hostname: '127.0.0.1', port: 0,
  fetch: (request, server) => app.fetch(request, { server }), websocket: { ...websocket, maxPayloadLength: 12 * 1024 * 1024 } });
const reply = (value: unknown) => console.log(`WORKFLOW ${JSON.stringify(value)}`);
reply({ ready: true, port: server.port });
try {
  for await (const line of createInterface({ input: process.stdin })) {
    const input = JSON.parse(line) as { id: number; action: string; docId?: string };
    try {
      if (input.action === 'seed') {
        const a = await seedUser(); userIds.push(a.id);
        const b = await seedUser(); userIds.push(b.id);
        const project = await seedProject(a.id); projectIds.push(project.id);
        await seedProjectMember(project.id, a.id, 'owner'); await seedProjectMember(project.id, b.id);
        const doc = await seedDoc(project.id, a.id, { content: [
          { id: 'target', type: 'paragraph', content: [{ type: 'text', text: 'before TARGET after', styles: {} }], children: [] },
          { id: 'writer-a', type: 'paragraph', content: [{ type: 'text', text: 'Writer A:', styles: {} }], children: [] },
          { id: 'writer-b', type: 'paragraph', content: [{ type: 'text', text: 'Writer B:', styles: {} }], children: [] },
        ] }); docIds.push(doc.id);
        const sessions = [await seedSession(a.id), await seedSession(b.id)];
        const token = await mcpTokenService.createToken(a.id, 'Combined workflow', ['docs:write']);
        reply({ id: input.id, data: { docId: doc.id, sessions: sessions.map(s => s.id), token: token.rawToken } });
      } else if (input.action === 'compact' && input.docId && docIds.includes(input.docId)) {
        await docCollabRepository.compactCurrent(input.docId);
        reply({ id: input.id, data: true });
      } else if (input.action === 'inspect' && input.docId && docIds.includes(input.docId)) {
        const current = await db.transaction(tx => readCurrentDocHistory(tx, input.docId!));
        const evidence = await db.select().from(docCollabContinuity).where(eq(docCollabContinuity.docId, input.docId));
        const receipts = await db.select().from(mcpIdempotencyKeys).where(eq(mcpIdempotencyKeys.resultEntityId, input.docId));
        reply({ id: input.id, data: { snapshot: Array.from(current.state), evidence: evidence[0] ? JSON.parse(evidence[0].checkpoint.toString()) : null, receipts: receipts.length } });
      } else if (input.action === 'stop') break;
      else throw new Error('Unknown harness command');
    } catch (error) { reply({ id: input.id, error: String(error) }); }
  }
} finally {
  server.stop(true);
  if (docIds.length) await db.delete(docs).where(inArray(docs.id, docIds));
  if (projectIds.length) await db.delete(projects).where(inArray(projects.id, projectIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await client.end();
}
