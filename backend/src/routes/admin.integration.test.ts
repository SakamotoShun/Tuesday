import { beforeAll, describe, expect, it } from 'bun:test';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let createRouteTestApp: typeof import('../test/integration').createRouteTestApp;
let createSessionCookie: typeof import('../test/integration').createSessionCookie;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedSession: typeof import('../test/integration').seedSession;
let seedUser: typeof import('../test/integration').seedUser;
let adminRoute: typeof import('./admin').admin;

if (runIntegration) {
  ({ createRouteTestApp, createSessionCookie, ensureIntegrationDb, seedSession, seedUser } = await import('../test/integration'));
  ({ admin: adminRoute } = await import('./admin'));
}

describeIntegration('Admin Routes', () => {
  beforeAll(async () => {
    await ensureIntegrationDb();
  });

  it('returns diagnostics for admin users', async () => {
    const adminUser = await seedUser({ role: 'admin', name: 'Admin User' });
    const session = await seedSession(adminUser.id);
    const app = createRouteTestApp('/api/v1/admin', adminRoute);

    const response = await app.request('/api/v1/admin/diagnostics', {
      headers: { Cookie: createSessionCookie(session.id) },
    });

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      data: {
        activeSessions: number;
        websockets: { chat: unknown; docs: unknown; whiteboards: unknown };
        runtime: { process: unknown; cleanupJobs: unknown };
      };
    };

    expect(Number(payload.data.activeSessions)).toBeGreaterThanOrEqual(1);
    expect(payload.data.websockets.chat).toBeDefined();
    expect(payload.data.websockets.docs).toBeDefined();
    expect(payload.data.websockets.whiteboards).toBeDefined();
    expect(payload.data.runtime.process).toBeDefined();
    expect(payload.data.runtime.cleanupJobs).toBeDefined();
  });

  it('rejects non-admin users', async () => {
    const user = await seedUser();
    const session = await seedSession(user.id);
    const app = createRouteTestApp('/api/v1/admin', adminRoute);

    const response = await app.request('/api/v1/admin/diagnostics', {
      headers: { Cookie: createSessionCookie(session.id) },
    });

    expect(response.status).toBe(403);
  });
});
