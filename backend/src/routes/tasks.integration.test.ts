import { beforeAll, describe, expect, it } from 'bun:test';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

let createRouteTestApp: typeof import('../test/integration').createRouteTestApp;
let createSessionCookie: typeof import('../test/integration').createSessionCookie;
let ensureIntegrationDb: typeof import('../test/integration').ensureIntegrationDb;
let seedProject: typeof import('../test/integration').seedProject;
let seedProjectMember: typeof import('../test/integration').seedProjectMember;
let seedSession: typeof import('../test/integration').seedSession;
let seedTask: typeof import('../test/integration').seedTask;
let seedTaskAssignee: typeof import('../test/integration').seedTaskAssignee;
let seedUser: typeof import('../test/integration').seedUser;
let tasksRoute: typeof import('./tasks').tasks;

if (runIntegration) {
  ({ createRouteTestApp, createSessionCookie, ensureIntegrationDb, seedProject, seedProjectMember, seedSession, seedTask, seedTaskAssignee, seedUser } = await import('../test/integration'));
  ({ tasks: tasksRoute } = await import('./tasks'));
}

describeIntegration('Tasks Routes', () => {
  beforeAll(async () => {
    await ensureIntegrationDb();
  });

  it('lists tasks assigned to the authenticated user', async () => {
    const user = await seedUser();
    const session = await seedSession(user.id);
    const project = await seedProject(user.id);
    await seedProjectMember(project.id, user.id, 'owner');
    const task = await seedTask(project.id, user.id, { title: 'Assigned task' });
    await seedTaskAssignee(task.id, user.id);

    const app = createRouteTestApp('/api/v1/tasks', tasksRoute);
    const response = await app.request('/api/v1/tasks/my', {
      headers: { Cookie: createSessionCookie(session.id) },
    });

    expect(response.status).toBe(200);

    const payload = await response.json() as { data: Array<{ id: string; title: string }> };
    expect(payload.data.some((entry) => entry.id === task.id && entry.title === 'Assigned task')).toBe(true);
  });
});
