import { z } from 'zod';
import { getDefaultStaticDir } from './utils/runtime-paths';

const configSchema = z.object({
  databaseUrl: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  sessionSecret: z.string().min(32),
  sessionDurationHours: z.number().int().min(1).max(720),
  corsOrigin: z.string().min(1),
  corsOrigins: z.array(z.string().min(1)).min(1),
  trustProxy: z.boolean(),
  rateLimitEnabled: z.boolean(),
  rateLimitBackend: z.enum(['memory', 'postgres']),
  uploadMaxSizeMb: z.number().int().min(1).max(100),
  uploadStoragePath: z.string().min(1),
  uploadAllowedTypes: z.array(z.string().min(1)),
  uploadPendingTtlMinutes: z.number().int().min(1).max(1440),
  deletedMessageFileRetentionDays: z.number().int().min(1).max(365),
  staticDir: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const config = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://tuesday:tuesday@localhost:5432/tuesday',
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    sessionSecret: process.env.SESSION_SECRET || 'default-secret-change-in-production-min-32-chars',
    sessionDurationHours: parseInt(process.env.SESSION_DURATION_HOURS || '24', 10),
    corsOrigin: corsOrigins[0] || 'http://localhost:5173',
    corsOrigins,
    trustProxy: process.env.TRUST_PROXY === 'true',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    rateLimitBackend: (process.env.RATE_LIMIT_BACKEND as 'memory' | 'postgres') || 'memory',
    uploadMaxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10', 10),
    uploadStoragePath: process.env.UPLOAD_STORAGE_PATH || '/app/data/uploads',
    uploadAllowedTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown').split(',').map((entry) => entry.trim()).filter(Boolean),
    uploadPendingTtlMinutes: parseInt(process.env.UPLOAD_PENDING_TTL_MINUTES || '30', 10),
    deletedMessageFileRetentionDays: parseInt(process.env.DELETED_MESSAGE_FILE_RETENTION_DAYS || '30', 10),
    staticDir: process.env.STATIC_DIR || (process.env.NODE_ENV === 'production' ? getDefaultStaticDir() : undefined),
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  };

  const result = configSchema.safeParse(config);
  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
