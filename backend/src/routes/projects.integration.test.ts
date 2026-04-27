import { beforeAll, describe, expect, it } from 'bun:test';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let createRouteTestApp: typeof import('../test/integration').createRouteTestApp;
let createSessionCookie: typeof import('../test/integration').createSessionCookie;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedSession: typeof import('../test/integration').seedSession;
let seedUser: typeof import('../test/integration').seedUser;
let projectsRoute: typeof import('./projects').projects;

if (runIntegration) {
  ({ createRouteTestApp, createSessionCookie, ensureIntegrationDb, seedSession, seedUser } = await import('../test/integration'));
  ({ projects: projectsRoute } = await import('./projects'));
}

describeIntegration('Projects Routes', () => {
  beforeAll(async () => {
    await ensureIntegrationDb();
  });

  it('creates a project for an authenticated user', async () => {
    const user = await seedUser();
    const session = await seedSession(user.id);
    const app = createRouteTestApp('/api/v1/projects', projectsRoute);

    const response = await app.request('/api/v1/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: createSessionCookie(session.id),
      },
      body: JSON.stringify({ name: 'Integration Project' }),
    });

    expect(response.status).toBe(201);

    const payload = await response.json() as { data: { name: string; ownerId: string } };
    expect(payload.data.name).toBe('Integration Project');
    expect(payload.data.ownerId).toBe(user.id);
  });
});
