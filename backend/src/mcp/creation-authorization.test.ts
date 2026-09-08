import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { McpContext } from './types';
import * as idempotency from './idempotency';
import { projectService, docService, taskService } from '../services';
import './tool-definitions';
import { getTool } from './tools';

const replay = mock(async (...args: Parameters<typeof idempotency.runIdempotentOperation>) => {
  const response = { id: 'cached-resource', title: 'Private resource', projectId: 'cached-project' };
  await args[5](response);
  return response;
});

const ctx = {
  user: { id: 'user-1', name: 'Member', role: 'member' },
  token: { userId: 'user-1', tokenId: 'token-1', scopes: new Set() },
} as McpContext;

beforeEach(() => {
  spyOn(idempotency, 'runIdempotentOperation').mockImplementation(replay as typeof idempotency.runIdempotentOperation);
  spyOn(docService, 'getDoc').mockResolvedValue({ id: 'cached-resource' } as any);
  spyOn(taskService, 'getTask').mockResolvedValue({ id: 'cached-resource' } as any);
});

afterEach(() => {
  mock.restore();
  replay.mockClear();
});

describe('idempotent creation authorization', () => {
  for (const [name, input] of [
    ['create_task', { projectId: 'project-1', title: 'Task' }],
    ['create_doc', { parent: { type: 'project', id: 'project-1' }, title: 'Doc' }],
    ['create_time_entry', { projectId: 'project-1', date: '2026-09-08', hours: 1 }],
  ] as const) {
    it(`${name} rejects a cached response after project access is removed`, async () => {
      spyOn(projectService, 'hasAccess').mockResolvedValue(false);
      await expect(getTool(name)!.handler({ ...input, idempotencyKey: 'existing-key' }, ctx))
        .rejects.toThrow('Access denied');
      expect(replay).not.toHaveBeenCalled();
    });

    it(`${name} permits replay while project access remains`, async () => {
      spyOn(projectService, 'hasAccess').mockResolvedValue(true);
      await expect(getTool(name)!.handler({ ...input, idempotencyKey: 'existing-key' }, ctx))
        .resolves.toMatchObject({ id: 'cached-resource' });
      expect(replay).toHaveBeenCalledTimes(1);
    });
  }

  it('checks parent doc access before replaying a child creation', async () => {
    spyOn(docService, 'getDoc').mockRejectedValue(new Error('Access denied to this doc'));
    await expect(getTool('create_doc')!.handler({
      parent: { type: 'doc', id: 'private-doc' }, title: 'Child', idempotencyKey: 'existing-key',
    }, ctx)).rejects.toThrow('Access denied');
    expect(replay).not.toHaveBeenCalled();
  });

  for (const [name, input, method] of [
    ['create_doc', { parent: { type: 'project', id: 'project-1' }, title: 'Doc' }, 'getDoc'],
    ['create_task', { projectId: 'project-1', title: 'Task' }, 'getTask'],
  ] as const) {
    it(`${name} checks the stored result even when the supplied project is accessible`, async () => {
      spyOn(projectService, 'hasAccess').mockResolvedValue(true);
      if (method === 'getDoc') spyOn(docService, 'getDoc').mockRejectedValue(new Error('Access denied'));
      else spyOn(taskService, 'getTask').mockRejectedValue(new Error('Access denied'));
      await expect(getTool(name)!.handler({ ...input, idempotencyKey: 'legacy-key' }, ctx))
        .rejects.toThrow('Access denied');
      expect(replay).toHaveBeenCalledTimes(1);
    });
  }

  it('checks the cached time-entry project rather than trusting the supplied project', async () => {
    spyOn(projectService, 'hasAccess').mockImplementation(async (id) => id === 'project-1');
    await expect(getTool('create_time_entry')!.handler({
      projectId: 'project-1', date: '2026-09-08', hours: 1, idempotencyKey: 'legacy-key',
    }, ctx)).rejects.toThrow('Access denied');
    expect(replay).toHaveBeenCalledTimes(1);
  });

  for (const [name, input] of [
    ['create_task', { projectId: 'project-1', title: 'Task' }],
    ['create_doc', { parent: { type: 'project', id: 'project-1' }, title: 'Doc' }],
    ['create_time_entry', { date: '2026-09-08', hours: 1 }],
  ] as const) {
    it(`${name} applies current freelancer restrictions to cached responses`, async () => {
      spyOn(projectService, 'hasAccess').mockResolvedValue(true);
      await expect(getTool(name)!.handler({ ...input, idempotencyKey: 'existing-key' }, {
        ...ctx, user: { ...ctx.user, role: 'freelancer' },
      })).rejects.toThrow('Freelancers cannot');
      expect(replay).not.toHaveBeenCalled();
    });
  }
});
