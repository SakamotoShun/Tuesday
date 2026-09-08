import { describe, expect, it, mock } from 'bun:test';
import { EmailDeliveryState, type EmailNotificationDelivery } from '../db/schema';
import { EmailNotificationWorker } from './emailNotificationWorker';

const workerConfig = {
  emailWorkerPollIntervalMs: 60_000,
  emailWorkerBatchSize: 10,
  emailWorkerLeaseMs: 60_000,
  emailWorkerDrainTimeoutMs: 100,
};

function delivery(state: string): EmailNotificationDelivery {
  return {
    id: 'delivery-1',
    notificationId: 'notification-1',
    userId: 'user-1',
    type: 'mention',
    state,
    userGeneration: 1,
    workspaceGeneration: 1,
    attemptCount: 1,
    retryCycle: 0,
    nextAttemptAt: new Date(),
    leaseToken: 'lease-1',
    leaseExpiresAt: new Date(Date.now() + 60_000),
    authorisedEmail: 'user@example.com',
    messageId: '<notification-1@tuesday.local>',
    lastError: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorker(overrides: Record<string, unknown> = {}) {
  const repository = {
    claimBatch: mock(async () => [] as EmailNotificationDelivery[]),
    authoriseSending: mock(async () => null),
    resumeSending: mock(async () => null),
    markSent: mock(async () => true),
    markFailed: mock(async () => 'retry' as const),
    ...overrides,
  };
  const email = {
    hasNotificationConfiguration: mock(async () => true),
    sendNotificationEmail: mock(async () => true),
  };
  const worker = new EmailNotificationWorker({
    deliveryRepository: repository,
    email,
    settings: { get: async <T>() => 'Tuesday' as T },
    workerConfig,
  });
  return { worker, repository, email };
}

describe('EmailNotificationWorker', () => {
  it('shares an in-flight cycle instead of claiming overlapping batches', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const claimBatch = mock(async () => {
      await blocked;
      return [] as EmailNotificationDelivery[];
    });
    const { worker } = createWorker({ claimBatch });

    const first = worker.runOnce();
    const second = worker.runOnce();
    expect(first).toBe(second);
    expect(claimBatch).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('resumes an expired authorised send without rechecking preferences', async () => {
    const claimed = delivery(EmailDeliveryState.SENDING);
    const resumeSending = mock(async () => ({
      id: claimed.id,
      leaseToken: claimed.leaseToken!,
      email: claimed.authorisedEmail!,
      recipientName: 'User',
      title: 'You were mentioned',
      link: '/notifications',
      messageId: claimed.messageId,
    }));
    const { worker, repository, email } = createWorker({
      claimBatch: mock(async () => [claimed]),
      resumeSending,
    });

    await worker.runOnce();

    expect(resumeSending).toHaveBeenCalledWith(
      claimed.id,
      claimed.leaseToken,
      workerConfig.emailWorkerLeaseMs,
    );
    expect(repository.authoriseSending).not.toHaveBeenCalled();
    expect(email.sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(repository.markSent).toHaveBeenCalledWith(claimed.id, claimed.leaseToken);
  });

  it('does not send a delivery denied at the consent boundary', async () => {
    const claimed = delivery(EmailDeliveryState.LEASED);
    const { worker, repository, email } = createWorker({ claimBatch: mock(async () => [claimed]) });
    await worker.runOnce();
    expect(repository.authoriseSending).toHaveBeenCalledWith(claimed.id, claimed.leaseToken, true, workerConfig.emailWorkerLeaseMs);
    expect(email.sendNotificationEmail).not.toHaveBeenCalled();
    expect(repository.markSent).not.toHaveBeenCalled();
    expect(worker.getStats().sent).toBe(0);
  });

  for (const outcome of ['retry', 'dead', null] as const) {
    it(`counts only recorded failure transitions (${outcome ?? 'lost lease'})`, async () => {
      const claimed = delivery(EmailDeliveryState.LEASED);
      const { worker, repository, email } = createWorker({
        claimBatch: mock(async () => [claimed]),
        authoriseSending: mock(async () => ({
          id: claimed.id, leaseToken: claimed.leaseToken!, email: 'user@example.com',
          recipientName: 'User', title: 'Mentioned', link: '/notifications', messageId: claimed.messageId,
        })),
        markFailed: mock(async () => outcome),
      });
      email.sendNotificationEmail.mockImplementation(async () => false);
      await worker.runOnce();
      expect(repository.markSent).not.toHaveBeenCalled();
      expect(repository.markFailed).toHaveBeenCalledWith(claimed, 'SMTP delivery failed');
      expect(worker.getStats()).toMatchObject({ sent: 0, retried: outcome === 'retry' ? 1 : 0, dead: outcome === 'dead' ? 1 : 0 });
    });
  }

  it('finishes the active send during drain without starting another claimed delivery', async () => {
    const first = delivery(EmailDeliveryState.LEASED);
    const second = { ...delivery(EmailDeliveryState.LEASED), id: 'delivery-2', leaseToken: 'lease-2' };
    let releaseSend!: () => void;
    let notifySendStarted!: () => void;
    const sendStarted = new Promise<void>((resolve) => { notifySendStarted = resolve; });
    const blockedSend = new Promise<void>((resolve) => { releaseSend = resolve; });
    const authoriseSending = mock(async (id: string, leaseToken: string) => ({
      id,
      leaseToken,
      email: 'user@example.com',
      recipientName: 'User',
      title: 'You were mentioned',
      link: '/notifications',
      messageId: `<${id}@tuesday.local>`,
    }));
    const { worker, email } = createWorker({
      claimBatch: mock(async () => [first, second]),
      authoriseSending,
    });
    email.sendNotificationEmail.mockImplementation(async () => {
      notifySendStarted();
      await blockedSend;
      return true;
    });

    const cycle = worker.runOnce();
    await sendStarted;
    const drain = worker.stopAndDrain(1_000);
    releaseSend();
    await Promise.all([cycle, drain]);

    expect(email.sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(authoriseSending).toHaveBeenCalledTimes(1);
    expect(worker.getStats().state).toBe('stopped');
  });

  it('remains draining when the active send exceeds the drain timeout', async () => {
    const claimed = delivery(EmailDeliveryState.LEASED);
    let releaseSend!: () => void;
    let notifySendStarted!: () => void;
    const sendStarted = new Promise<void>((resolve) => { notifySendStarted = resolve; });
    const blockedSend = new Promise<void>((resolve) => { releaseSend = resolve; });
    const { worker, email } = createWorker({
      claimBatch: mock(async () => [claimed]),
      authoriseSending: mock(async () => ({
        id: claimed.id,
        leaseToken: claimed.leaseToken!,
        email: 'user@example.com',
        recipientName: 'User',
        title: 'You were mentioned',
        link: '/notifications',
        messageId: claimed.messageId,
      })),
    });
    email.sendNotificationEmail.mockImplementation(async () => {
      notifySendStarted();
      await blockedSend;
      return true;
    });

    const cycle = worker.runOnce();
    await sendStarted;
    await worker.stopAndDrain(1);
    expect(worker.getStats().state).toBe('draining');

    releaseSend();
    await cycle;
    expect(worker.getStats().state).toBe('stopped');
  });
});
