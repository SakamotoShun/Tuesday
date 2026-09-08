import { config } from '../config';
import { EmailDeliveryState } from '../db/schema';
import { emailNotificationDeliveryRepository } from '../repositories/emailNotificationDelivery';
import { settingsRepository } from '../repositories/settings';
import { log } from '../utils/logger';
import { emailService } from './email';

interface EmailWorkerStats {
  state: 'stopped' | 'running' | 'draining';
  cycleInFlight: boolean;
  startedAt: string | null;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  lastError: string | null;
}

interface EmailWorkerDependencies {
  deliveryRepository: Pick<typeof emailNotificationDeliveryRepository,
    'claimBatch' | 'authoriseSending' | 'resumeSending' | 'markSent' | 'markFailed'>;
  email: Pick<typeof emailService, 'hasNotificationConfiguration' | 'sendNotificationEmail'>;
  settings: Pick<typeof settingsRepository, 'get'>;
  workerConfig: Pick<typeof config,
    'emailWorkerPollIntervalMs' | 'emailWorkerBatchSize' | 'emailWorkerLeaseMs' | 'emailWorkerDrainTimeoutMs'>;
}

export class EmailNotificationWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private runPromise: Promise<void> | null = null;
  private stopping = true;
  private readonly dependencies: EmailWorkerDependencies;
  private stats: EmailWorkerStats = {
    state: 'stopped',
    cycleInFlight: false,
    startedAt: null,
    lastPollAt: null,
    lastSuccessAt: null,
    lastDurationMs: null,
    claimed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    lastError: null,
  };

  constructor(dependencies: Partial<EmailWorkerDependencies> = {}) {
    this.dependencies = {
      deliveryRepository: dependencies.deliveryRepository ?? emailNotificationDeliveryRepository,
      email: dependencies.email ?? emailService,
      settings: dependencies.settings ?? settingsRepository,
      workerConfig: dependencies.workerConfig ?? config,
    };
  }

  start(): void {
    if (!this.stopping) return;
    this.stopping = false;
    this.stats.state = 'running';
    this.stats.startedAt = new Date().toISOString();
    this.schedule(0);
  }

  wake(): void {
    if (this.stopping || this.runPromise) return;
    if (this.timer) clearTimeout(this.timer);
    this.schedule(0);
  }

  runOnce(): Promise<void> {
    if (this.runPromise) return this.runPromise;
    this.runPromise = this.runCycle().finally(() => {
      this.runPromise = null;
      if (this.stopping && this.stats.state === 'draining') {
        this.stats.state = 'stopped';
      } else if (!this.stopping) {
        this.schedule(this.dependencies.workerConfig.emailWorkerPollIntervalMs);
      }
    });
    return this.runPromise;
  }

  async stopAndDrain(timeoutMs = this.dependencies.workerConfig.emailWorkerDrainTimeoutMs): Promise<void> {
    this.stopping = true;
    this.stats.state = 'draining';
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.runPromise) {
      this.stats.state = 'stopped';
      return;
    }

    let drained = false;
    await Promise.race([
      this.runPromise.then(() => { drained = true; }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    if (drained) this.stats.state = 'stopped';
  }

  getStats(): EmailWorkerStats {
    return { ...this.stats };
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce();
    }, delayMs);
    this.timer.unref?.();
  }

  private async runCycle(): Promise<void> {
    const startedAt = Date.now();
    this.stats.cycleInFlight = true;
    this.stats.lastPollAt = new Date().toISOString();
    try {
      const deliveries = await this.dependencies.deliveryRepository.claimBatch(
        this.dependencies.workerConfig.emailWorkerBatchSize,
        this.dependencies.workerConfig.emailWorkerLeaseMs,
      );
      this.stats.claimed += deliveries.length;
      const smtpReady = await this.dependencies.email.hasNotificationConfiguration();
      const workspaceName = await this.dependencies.settings.get<string>('workspace_name') ?? 'Tuesday';

      for (const delivery of deliveries) {
        if (this.stats.state === 'draining') break;
        const authorised = delivery.state === EmailDeliveryState.SENDING
          ? await this.dependencies.deliveryRepository.resumeSending(
              delivery.id,
              delivery.leaseToken!,
              this.dependencies.workerConfig.emailWorkerLeaseMs,
            )
          : await this.dependencies.deliveryRepository.authoriseSending(
              delivery.id,
              delivery.leaseToken!,
              smtpReady,
              this.dependencies.workerConfig.emailWorkerLeaseMs,
            );
        if (!authorised) continue;
        try {
          const sent = await this.dependencies.email.sendNotificationEmail({
            to: authorised.email,
            recipientName: authorised.recipientName,
            notificationTitle: authorised.title,
            relativeLink: authorised.link,
            workspaceName,
            messageId: authorised.messageId,
          });
          if (!sent) throw new Error('SMTP delivery failed');
          const recorded = await this.dependencies.deliveryRepository.markSent(authorised.id, authorised.leaseToken);
          if (!recorded) throw new Error('Delivery lease expired before completion was recorded');
          this.stats.sent += 1;
          this.stats.lastSuccessAt = new Date().toISOString();
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 200) : 'Unknown delivery error';
          const outcome = await this.dependencies.deliveryRepository.markFailed(delivery, message);
          if (outcome) this.stats[outcome === 'dead' ? 'dead' : 'retried'] += 1;
          this.stats.lastError = message;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : 'Unknown worker error';
      this.stats.lastError = message;
      log('error', 'email_worker.cycle_failed', { error_message: message });
    } finally {
      this.stats.cycleInFlight = false;
      this.stats.lastDurationMs = Date.now() - startedAt;
    }
  }
}

export const emailNotificationWorker = new EmailNotificationWorker();
