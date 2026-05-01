import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { db } from '../db/client';
import { sessionRepository } from './session';
import { UserRepository } from './user';

const originalInsert = db.insert;
const originalUpdate = db.update;
const originalInvalidateByUserId = sessionRepository.invalidateByUserId;

function createDuplicateEmailError(): Error & { code: string; constraint_name: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
    code: '23505',
    constraint_name: 'users_email_key',
  });
}

describe('UserRepository', () => {
  beforeEach(() => {
    (db as any).insert = () => ({
      values: () => ({
        returning: async () => [{ id: 'user-1' }],
      }),
    });

    (db as any).update = () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: 'user-1' }],
        }),
      }),
    });

    sessionRepository.invalidateByUserId = async () => 0;
  });

  afterEach(() => {
    (db as any).insert = originalInsert;
    (db as any).update = originalUpdate;
    sessionRepository.invalidateByUserId = originalInvalidateByUserId;
  });

  it('translates duplicate email errors on create', async () => {
    const repository = new UserRepository();

    (db as any).insert = () => ({
      values: () => ({
        returning: async () => {
          throw createDuplicateEmailError();
        },
      }),
    });

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

    (db as any).update = () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            throw createDuplicateEmailError();
          },
        }),
      }),
    });

    await expect(
      repository.update('user-1', { email: 'duplicate@example.com' })
    ).rejects.toThrow('User with this email already exists');
  });
});
