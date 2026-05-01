import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { config } from '../config';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let createRouteTestApp: typeof import('../test/integration').createRouteTestApp;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedUser: typeof import('../test/integration').seedUser;
let db: typeof import('../db/client').db;
let settings: typeof import('../db/schema').settings;
let authRouter: typeof import('./auth').authRouter;

if (runIntegration) {
  ({ createRouteTestApp, ensureIntegrationDb, seedUser } = await import('../test/integration'));
  ({ db } = await import('../db/client'));
  ({ settings } = await import('../db/schema'));
  ({ authRouter } = await import('./auth'));
}

describeIntegration('Auth Routes', () => {
  const originalRateLimitEnabled = config.rateLimitEnabled;

  beforeAll(async () => {
    await ensureIntegrationDb();
  });

  beforeEach(async () => {
    config.rateLimitEnabled = false;

    await db.insert(settings).values({
      key: 'allow_registration',
      value: true,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: settings.key,
      set: {
        value: true,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(() => {
    config.rateLimitEnabled = originalRateLimitEnabled;
  });

  it('returns conflict when registration hits a duplicate email at write time', async () => {
    const email = `duplicate-register-${randomUUID()}@example.com`;
    await seedUser({ email });

    const app = createRouteTestApp('/api/v1/auth', authRouter);
    const response = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: 'password-123',
        name: 'Duplicate User',
      }),
    });

    expect(response.status).toBe(409);

    const payload = await response.json() as { error: { message: string } };
    expect(payload.error.message).toBe('User with this email already exists');
  });
});
