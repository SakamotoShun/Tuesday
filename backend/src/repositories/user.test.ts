import { beforeEach, describe, expect, it, mock } from 'bun:test';

let insertReturning: () => Promise<Array<{ id: string }>> = async () => [{ id: 'user-1' }];
let updateReturning: () => Promise<Array<{ id: string }>> = async () => [{ id: 'user-1' }];
let invalidateByUserId: (userId: string) => Promise<number> = async () => 0;

mock.module('../db/client', () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: () => insertReturning(),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => updateReturning(),
        }),
      }),
    }),
  },
}));

mock.module('./session', () => ({
  SessionRepository: class {},
  sessionRepository: {
    invalidateByUserId: (userId: string) => invalidateByUserId(userId),
  },
}));

const { UserRepository } = await import('./user');

function createDuplicateEmailError(): Error & { code: string; constraint_name: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
    code: '23505',
    constraint_name: 'users_email_key',
  });
}

describe('UserRepository', () => {
  beforeEach(() => {
    insertReturning = async () => [{ id: 'user-1' }];
    updateReturning = async () => [{ id: 'user-1' }];
    invalidateByUserId = async () => 0;
  });

  it('translates duplicate email errors on create', async () => {
    const repository = new UserRepository();

    insertReturning = async () => {
      throw createDuplicateEmailError();
    };

    await expect(
      repository.create({
        email: 'duplicate@example.com',
        passwordHash: 'hashed-password',
        name: 'Duplicate User',
      } as any)
    ).rejects.toThrow('User with this email already exists');
  });

  it('translates duplicate email errors on update', async () => {
    const repository = new UserRepository();

    updateReturning = async () => {
      throw createDuplicateEmailError();
    };

    await expect(
      repository.update('user-1', { email: 'duplicate@example.com' })
    ).rejects.toThrow('User with this email already exists');
  });
});
