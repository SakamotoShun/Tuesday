import { describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../db/client';
import { hashIdempotencyRequest, runIdempotentOperation } from './idempotency';
import type { AuthenticatedMcpUser } from '../services/mcpToken';

describe('hashIdempotencyRequest', () => {
  it('is stable across object key ordering and top-level idempotency keys', () => {
    const first = hashIdempotencyRequest({
      title: 'Task',
      projectId: 'project-1',
      idempotencyKey: 'first-key',
    });
    const second = hashIdempotencyRequest({
      idempotencyKey: 'second-key',
      projectId: 'project-1',
      title: 'Task',
    });

    expect(first).toBe(second);
  });

  it('retains nested fields named idempotencyKey in the request identity', () => {
    const first = hashIdempotencyRequest({
      blocks: [{ props: { idempotencyKey: 'content-a' } }],
      idempotencyKey: 'request-key',
    });
    const second = hashIdempotencyRequest({
      blocks: [{ props: { idempotencyKey: 'content-b' } }],
      idempotencyKey: 'request-key',
    });

    expect(first).not.toBe(second);
  });

  it('changes when array order or payload values change', () => {
    expect(hashIdempotencyRequest({ ids: ['a', 'b'] }))
      .not.toBe(hashIdempotencyRequest({ ids: ['b', 'a'] }));
    expect(hashIdempotencyRequest({ title: 'A' }))
      .not.toBe(hashIdempotencyRequest({ title: 'B' }));
  });
});

describe('idempotent replay', () => {
  for (const requestHash of ['legacy', hashIdempotencyRequest({ title: 'Task' })]) {
    it(`reauthorizes a stored response with request hash ${requestHash}`, async () => {
      const response = { id: 'private-task' };
      const tx = {
        execute: async () => {},
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
          responseJson: response, requestHash, toolVersion: 1,
        }] }) }) }),
      };
      const transaction = spyOn(db, 'transaction').mockImplementation(async (callback) => callback(tx as any));
      const operation = mock(async () => ({ response }));
      const authorizeReplay = mock(async () => { throw new Error('Access denied'); });
      try {
        await expect(runIdempotentOperation(
          { tokenId: 'token-1', userId: 'user-1', authType: 'pat' } as AuthenticatedMcpUser,
          'key', 'create_task', { title: 'Task' }, operation, authorizeReplay,
        )).rejects.toThrow('Access denied');
        expect(authorizeReplay).toHaveBeenCalledWith(response);
        expect(operation).not.toHaveBeenCalled();
      } finally {
        transaction.mockRestore();
      }
    });
  }
});
