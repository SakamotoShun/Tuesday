import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { db, type DbTransaction } from '../db/client';
import { EmailDeliveryState, type EmailNotificationDelivery } from '../db/schema';
import { EmailNotificationDeliveryRepository } from './emailNotificationDelivery';

const repository = new EmailNotificationDeliveryRepository();
const spies: Array<{ mockRestore(): void }> = [];
let rows: unknown[][];
let updatedRows: unknown[];
const set = mock((_data: unknown): any => update);
const where = mock((_condition: any): any => update);
const update = {
  set,
  where,
  returning: mock(async () => updatedRows),
  then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(updatedRows).then(resolve),
};
const transaction = {
  select: mock(() => {
    if (rows.length === 0) throw new Error('Unexpected database read');
    return Object.assign(Promise.resolve(rows.shift()!), {
      from() { return this; },
      where() { return this; },
      for() { return this; },
    });
  }),
  update: mock(() => update),
} as unknown as DbTransaction;

function delivery(overrides: Partial<EmailNotificationDelivery> = {}): EmailNotificationDelivery {
  return {
    id: 'delivery-1', notificationId: 'notification-1', userId: 'user-1', type: 'mention',
    state: EmailDeliveryState.LEASED, userGeneration: 2, workspaceGeneration: 3,
    attemptCount: 1, retryCycle: 0, nextAttemptAt: new Date(), leaseToken: 'lease-1',
    leaseExpiresAt: new Date(Date.now() + 60_000), authorisedEmail: null,
    messageId: '<notification-1@tuesday.local>', lastError: null, sentAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

beforeEach(() => {
  rows = [];
  updatedRows = [{ id: 'delivery-1', messageId: '<notification-1@tuesday.local>' }];
  set.mockClear();
  where.mockClear();
  update.returning.mockClear();
  spies.push(spyOn(db, 'transaction').mockImplementation(async (callback) => callback(transaction)));
  spies.push(spyOn(db, 'update').mockReturnValue(update as any));
});

afterEach(() => {
  for (const spy of spies.splice(0).reverse()) spy.mockRestore();
});

describe('EmailNotificationDeliveryRepository', () => {
  it('authorises only the current opted-in generations and snapshots the recipient address', async () => {
    const candidate = delivery();
    rows = [
      [{ enabled: true, generation: 3 }], [candidate],
      [{ name: 'User', email: 'current@example.com', isDisabled: false }],
      [{ enabled: true, generation: 2 }], [candidate],
      [{ title: 'Mentioned', link: '/notifications' }],
    ];
    const result = await repository.authoriseSending(candidate.id, candidate.leaseToken!, true, 60_000);
    expect(result).toEqual({
      id: candidate.id, leaseToken: candidate.leaseToken!, email: 'current@example.com',
      recipientName: 'User', title: 'Mentioned', link: '/notifications', messageId: candidate.messageId,
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ state: 'sending', authorisedEmail: 'current@example.com' }));
  });

  for (const [name, control, user, preference] of [
    ['workspace disabled', { enabled: false, generation: 3 }, { isDisabled: false }, { enabled: true, generation: 2 }],
    ['workspace generation changed', { enabled: true, generation: 4 }, { isDisabled: false }, { enabled: true, generation: 2 }],
    ['user disabled', { enabled: true, generation: 3 }, { isDisabled: true }, { enabled: true, generation: 2 }],
    ['user opted out', { enabled: true, generation: 3 }, { isDisabled: false }, { enabled: false, generation: 2 }],
    ['user generation changed', { enabled: true, generation: 3 }, { isDisabled: false }, { enabled: true, generation: 4 }],
    ['no consent recorded', { enabled: true, generation: 3 }, { isDisabled: false }, null],
  ] as const) {
    it(`cancels a leased delivery when ${name}`, async () => {
      const candidate = delivery();
      rows = [[control], [candidate], [user], preference ? [preference] : [], [candidate]];
      expect(await repository.authoriseSending(candidate.id, candidate.leaseToken!, true, 60_000)).toBeNull();
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ state: 'cancelled', leaseToken: null }));
    });
  }

  it('does not authorise a delivery claimed by a different worker', async () => {
    rows = [[{ enabled: true, generation: 3 }], [delivery({ leaseToken: 'replacement-lease' })]];
    expect(await repository.authoriseSending('delivery-1', 'stale-lease', true, 60_000)).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  for (const attemptCount of [1, 10]) {
    it(`bounds configuration-unavailable retries at attempt ${attemptCount}`, async () => {
      const candidate = delivery({ attemptCount });
      rows = [
        [{ enabled: true, generation: 3 }], [candidate], [{ isDisabled: false }],
        [{ enabled: true, generation: 2 }], [candidate],
      ];
      expect(await repository.authoriseSending(candidate.id, candidate.leaseToken!, false, 60_000)).toBeNull();
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ state: attemptCount === 10 ? 'dead' : 'retry_wait' }));
    });
  }

  it('does not report a retry when a failed send no longer owns the lease', async () => {
    updatedRows = [];
    const candidate = delivery({ state: EmailDeliveryState.SENDING });
    expect(await repository.markFailed(candidate, 'SMTP failed')).toBeNull();
    const condition = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(condition.params).toEqual([candidate.id, candidate.leaseToken, EmailDeliveryState.SENDING]);
  });

  for (const attemptCount of [1, 10]) {
    it(`records a failed owned send at attempt ${attemptCount}`, async () => {
      const candidate = delivery({ state: EmailDeliveryState.SENDING, attemptCount });
      expect(await repository.markFailed(candidate, 'SMTP failed')).toBe(attemptCount === 10 ? 'dead' : 'retry');
      expect(set).toHaveBeenCalledWith(expect.objectContaining({
        state: attemptCount === 10 ? 'dead' : 'retry_wait', leaseToken: null, lastError: 'SMTP failed',
      }));
    });
  }
});
