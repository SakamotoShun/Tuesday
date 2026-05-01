import { randomUUID } from 'node:crypto';
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
    const sourceEmail = `member-old-${randomUUID()}@example.com`;
    const targetEmail = `member-new-${randomUUID()}@example.com`;
    const user = await seedUser({ email: sourceEmail });
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
        newEmail: targetEmail,
      }),
    });

    expect(response.status).toBe(200);

    const payload = await response.json() as { data: { user: { email: string } } };
    expect(payload.data.user.email).toBe(targetEmail);
  });

  it('rejects email changes with an incorrect password', async () => {
    const sourceEmail = `member-wrong-password-${randomUUID()}@example.com`;
    const targetEmail = `member-denied-${randomUUID()}@example.com`;
    const user = await seedUser({ email: sourceEmail });
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
        newEmail: targetEmail,
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('Current password is incorrect');
  });

  it('rejects email changes when the target email is already taken', async () => {
    const sourceEmail = `member-duplicate-source-${randomUUID()}@example.com`;
    const targetEmail = `member-duplicate-target-${randomUUID()}@example.com`;
    const user = await seedUser({ email: sourceEmail });
    await seedUser({ email: targetEmail });
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
        newEmail: targetEmail,
      }),
    });

    expect(response.status).toBe(409);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('User with this email already exists');
  });
});
