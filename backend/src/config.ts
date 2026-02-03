import { z } from 'zod';

const configSchema = z.object({
  databaseUrl: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  sessionSecret: z.string().min(32),
  sessionDurationHours: z.number().int().min(1).max(720),
  corsOrigin: z.string().min(1),
  rateLimitEnabled: z.boolean(),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const config = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://tuesday:tuesday@localhost:5432/tuesday',
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    sessionSecret: process.env.SESSION_SECRET || 'default-secret-change-in-production-min-32-chars',
    sessionDurationHours: parseInt(process.env.SESSION_DURATION_HOURS || '24', 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  };

  const result = configSchema.safeParse(config);
  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
