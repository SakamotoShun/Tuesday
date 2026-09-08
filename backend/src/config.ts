import { z } from 'zod';
import { getDefaultStaticDir } from './utils/runtime-paths';

const configSchema = z.object({
  databaseUrl: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  publicBaseUrl: z.string().url().optional(),
  sessionSecret: z.string().min(32),
  sessionDurationHours: z.number().int().min(1).max(720),
  corsOrigin: z.string().min(1),
  corsOrigins: z.array(z.string().min(1)).min(1),
  trustProxy: z.boolean(),
  trustedProxyHops: z.number().int().min(1).max(10),
  rateLimitEnabled: z.boolean(),
  rateLimitBackend: z.enum(['memory', 'postgres']),
  whiteboardMaxMessageMb: z.number().int().min(1).max(50),
  uploadMaxSizeMb: z.number().int().min(1).max(100),
  uploadStoragePath: z.string().min(1),
  uploadAllowedTypes: z.array(z.string().min(1)),
  uploadPendingTtlMinutes: z.number().int().min(1).max(1440),
  deletedMessageFileRetentionDays: z.number().int().min(1).max(365),
  staticDir: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  emailWorkerPollIntervalMs: z.number().int().min(250).max(60_000),
  emailWorkerBatchSize: z.number().int().min(1).max(100),
  emailWorkerLeaseMs: z.number().int().min(60_000).max(900_000),
  emailWorkerDrainTimeoutMs: z.number().int().min(1_000).max(60_000),
  smtpConnectionTimeoutMs: z.number().int().min(1_000).max(60_000),
  smtpGreetingTimeoutMs: z.number().int().min(1_000).max(60_000),
  smtpSocketTimeoutMs: z.number().int().min(1_000).max(120_000),
}).superRefine((value, context) => {
  const smtpTimeoutBudgetMs = value.smtpConnectionTimeoutMs + value.smtpGreetingTimeoutMs +
    value.smtpSocketTimeoutMs;
  const minimumLeaseMs = smtpTimeoutBudgetMs + 10_000;
  if (smtpTimeoutBudgetMs > 50_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['smtpSocketTimeoutMs'],
      message: 'combined SMTP timeouts must not exceed 50000ms',
    });
  }
  if (value.emailWorkerLeaseMs < minimumLeaseMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['emailWorkerLeaseMs'],
      message: `must be at least ${minimumLeaseMs}ms for the configured SMTP timeouts`,
    });
  }
  if (value.emailWorkerDrainTimeoutMs < minimumLeaseMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['emailWorkerDrainTimeoutMs'],
      message: `must be at least ${minimumLeaseMs}ms for the configured SMTP timeouts`,
    });
  }

  if (value.publicBaseUrl) {
    const url = new URL(value.publicBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicBaseUrl'],
        message: 'must be an HTTP(S) origin without credentials, query, or fragment',
      });
    } else if (
      value.nodeEnv === 'production' &&
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicBaseUrl'],
        message: 'must use HTTPS in production',
      });
    }
  }
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const nodeEnv = (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development';
  const rawCorsOrigin = process.env.CORS_ORIGIN ?? (nodeEnv === 'production' ? '' : 'http://localhost:5173');
  const corsOrigins = rawCorsOrigin
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const publicBaseUrl = process.env.TUESDAY_BASE_URL?.trim().replace(/\/+$/, '') || undefined;

  if (nodeEnv === 'production' && corsOrigins.length === 0) {
    console.error('Configuration validation failed: CORS_ORIGIN must be set in production');
    process.exit(1);
  }

  const config = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://tuesday:tuesday@localhost:5432/tuesday',
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv,
    publicBaseUrl,
    sessionSecret: process.env.SESSION_SECRET || 'default-secret-change-in-production-min-32-chars',
    sessionDurationHours: parseInt(process.env.SESSION_DURATION_HOURS || '24', 10),
    corsOrigin: corsOrigins[0] || 'http://localhost:5173',
    corsOrigins,
    trustProxy: process.env.TRUST_PROXY === 'true',
    trustedProxyHops: parseInt(process.env.TRUSTED_PROXY_HOPS || '1', 10),
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    rateLimitBackend: (process.env.RATE_LIMIT_BACKEND as 'memory' | 'postgres') || 'memory',
    whiteboardMaxMessageMb: parseInt(process.env.WHITEBOARD_MAX_MESSAGE_MB || '10', 10),
    uploadMaxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10', 10),
    uploadStoragePath: process.env.UPLOAD_STORAGE_PATH || '/app/data/uploads',
    uploadAllowedTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown').split(',').map((entry) => entry.trim()).filter(Boolean),
    uploadPendingTtlMinutes: parseInt(process.env.UPLOAD_PENDING_TTL_MINUTES || '30', 10),
    deletedMessageFileRetentionDays: parseInt(process.env.DELETED_MESSAGE_FILE_RETENTION_DAYS || '30', 10),
    staticDir: process.env.STATIC_DIR || (nodeEnv === 'production' ? getDefaultStaticDir() : undefined),
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    emailWorkerPollIntervalMs: parseInt(process.env.EMAIL_WORKER_POLL_INTERVAL_MS || '1000', 10),
    emailWorkerBatchSize: parseInt(process.env.EMAIL_WORKER_BATCH_SIZE || '10', 10),
    emailWorkerLeaseMs: parseInt(process.env.EMAIL_WORKER_LEASE_MS || '60000', 10),
    emailWorkerDrainTimeoutMs: parseInt(process.env.EMAIL_WORKER_DRAIN_TIMEOUT_MS || '60000', 10),
    smtpConnectionTimeoutMs: parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10),
    smtpGreetingTimeoutMs: parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '10000', 10),
    smtpSocketTimeoutMs: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '30000', 10),
  };

  const result = configSchema.safeParse(config);
  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
