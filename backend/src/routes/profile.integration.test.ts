import { beforeAll, describe, expect, it } from 'bun:test';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let createRouteTestApp: typeof import('../test/integration').createRouteTestApp;
let createSessionCookie: typeof import('../test/integration').createSessionCookie;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedSession: typeof import('../test/integration').seedSession;
let seedUser: typeof import('../test/integration').seedUser;
let profileRoute: typeof import('./profile').profile;

if (runIntegration) {
  ({ createRouteTestApp, createSessionCookie, ensureIntegrationDb, seedSession, seedUser } = await import('../test/integration'));
  ({ profile: profileRoute } = await import('./profile'));
}

describeIntegration('Profile Routes', () => {
  beforeAll(async () => {
    await ensureIntegrationDb();
  });

  it('changes email when the current password is valid', async () => {
    const user = await seedUser({ email: 'member-old@example.com' });
    const session = await seedSession(user.id);
    const app = createRouteTestApp('/api/v1/profile', profileRoute);

    const response = await app.request('/api/v1/profile/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: createSessionCookie(session.id),
      },
      body: JSON.stringify({
        currentPassword: 'password-123',
        newEmail: 'member-new@example.com',
      }),
    });

    expect(response.status).toBe(200);

    const payload = await response.json() as { data: { user: { email: string } } };
    expect(payload.data.user.email).toBe('member-new@example.com');
  });

  it('rejects email changes with an incorrect password', async () => {
    const user = await seedUser({ email: 'member-wrong-password@example.com' });
    const session = await seedSession(user.id);
    const app = createRouteTestApp('/api/v1/profile', profileRoute);

    const response = await app.request('/api/v1/profile/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: createSessionCookie(session.id),
      },
      body: JSON.stringify({
        currentPassword: 'wrong-password',
        newEmail: 'member-denied@example.com',
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('Current password is incorrect');
  });

  it('rejects email changes when the target email is already taken', async () => {
    const user = await seedUser({ email: 'member-duplicate-source@example.com' });
    await seedUser({ email: 'member-duplicate-target@example.com' });
    const session = await seedSession(user.id);
    const app = createRouteTestApp('/api/v1/profile', profileRoute);

    const response = await app.request('/api/v1/profile/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: createSessionCookie(session.id),
      },
      body: JSON.stringify({
        currentPassword: 'password-123',
        newEmail: 'member-duplicate-target@example.com',
      }),
    });

    expect(response.status).toBe(409);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('User with this email already exists');
  });
});
