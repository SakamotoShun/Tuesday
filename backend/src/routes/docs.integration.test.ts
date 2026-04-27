import { beforeAll, describe, expect, it } from 'bun:test';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let createRouteTestApp: typeof import('../test/integration').createRouteTestApp;
let createSessionCookie: typeof import('../test/integration').createSessionCookie;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedDoc: typeof import('../test/integration').seedDoc;
let seedProject: typeof import('../test/integration').seedProject;
let seedProjectMember: typeof import('../test/integration').seedProjectMember;
let seedSession: typeof import('../test/integration').seedSession;
let seedUser: typeof import('../test/integration').seedUser;
let docsRoute: typeof import('./docs').docs;

if (runIntegration) {
  ({ createRouteTestApp, createSessionCookie, ensureIntegrationDb, seedDoc, seedProject, seedProjectMember, seedSession, seedUser } = await import('../test/integration'));
  ({ docs: docsRoute } = await import('./docs'));
}

describeIntegration('Docs Routes', () => {
  beforeAll(async () => {
    await ensureIntegrationDb();
  });

  it('returns a project doc for a project member', async () => {
    const user = await seedUser();
    const session = await seedSession(user.id);
    const project = await seedProject(user.id);
    await seedProjectMember(project.id, user.id, 'owner');
    const doc = await seedDoc(project.id, user.id, { title: 'Integration Doc' });
    const app = createRouteTestApp('/api/v1/docs', docsRoute);

    const response = await app.request(`/api/v1/docs/${doc.id}`, {
      headers: { Cookie: createSessionCookie(session.id) },
    });

    expect(response.status).toBe(200);

    const payload = await response.json() as { data: { id: string; title: string } };
    expect(payload.data.id).toBe(doc.id);
    expect(payload.data.title).toBe('Integration Doc');
  });

  it('rejects access to a project doc for a non-member', async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const session = await seedSession(outsider.id);
    const project = await seedProject(owner.id);
    await seedProjectMember(project.id, owner.id, 'owner');
    const doc = await seedDoc(project.id, owner.id);
    const app = createRouteTestApp('/api/v1/docs', docsRoute);

    const response = await app.request(`/api/v1/docs/${doc.id}`, {
      headers: { Cookie: createSessionCookie(session.id) },
    });

    expect(response.status).toBe(403);
  });
});
