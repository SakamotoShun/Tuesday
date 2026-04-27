import { access, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { client, DB_POOL_CONFIG } from './db/client';
import { config } from './config';
import { getDefaultMigrationsDir } from './utils/runtime-paths';

export type CleanupJobName =
  | 'expiredSessions'
  | 'expiredAuthTokens'
  | 'expiredPendingFiles'
  | 'orphanedFiles'
  | 'deletedMessageFiles';

interface CleanupJobStats {
  runCount: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  lastDeletedCount: number | null;
  lastError: string | null;
}

const cleanupJobs: Record<CleanupJobName, CleanupJobStats> = {
  expiredSessions: createEmptyCleanupJobStats(),
  expiredAuthTokens: createEmptyCleanupJobStats(),
  expiredPendingFiles: createEmptyCleanupJobStats(),
  orphanedFiles: createEmptyCleanupJobStats(),
  deletedMessageFiles: createEmptyCleanupJobStats(),
};

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();

const startedAt = Date.now();

function createEmptyCleanupJobStats(): CleanupJobStats {
  return {
    runCount: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    lastDurationMs: null,
    lastDeletedCount: null,
    lastError: null,
  };
}

export async function runTrackedCleanupJob(name: CleanupJobName, task: () => Promise<number>) {
  const startedAtMs = Date.now();
  const stats = cleanupJobs[name];
  stats.runCount += 1;
  stats.lastRunAt = new Date(startedAtMs).toISOString();

  try {
    const deletedCount = await task();
    stats.lastSuccessAt = new Date().toISOString();
    stats.lastDurationMs = Date.now() - startedAtMs;
    stats.lastDeletedCount = deletedCount;
    stats.lastError = null;
    return deletedCount;
  } catch (error) {
    stats.lastDurationMs = Date.now() - startedAtMs;
    stats.lastDeletedCount = null;
    stats.lastError = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}

export async function checkReadiness() {
  const checks = {
    database: false,
    uploadStorageWritable: false,
    migrationsApplied: false,
  };

  try {
    await client`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  try {
    await access(config.uploadStoragePath, fsConstants.W_OK);
    checks.uploadStorageWritable = true;
  } catch {
    checks.uploadStorageWritable = false;
  }

  try {
    const migrationFiles = (await readdir(getMigrationsDir())).filter((file) => file.endsWith('.sql'));
    const [result] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM drizzle_migrations`;
    checks.migrationsApplied = Number(result?.count ?? 0) === migrationFiles.length;
  } catch {
    checks.migrationsApplied = false;
  }

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
  };
}

export function getDiagnosticsSnapshot() {
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    database: {
      pool: DB_POOL_CONFIG,
    },
    process: {
      memory: process.memoryUsage(),
    },
    eventLoopDelayMs: {
      mean: Number((eventLoopDelay.mean / 1_000_000).toFixed(2)),
      max: Number((eventLoopDelay.max / 1_000_000).toFixed(2)),
      p95: Number((eventLoopDelay.percentile(95) / 1_000_000).toFixed(2)),
    },
    cleanupJobs,
  };
}

export function getMigrationsDir() {
  return process.env.MIGRATIONS_DIR || getDefaultMigrationsDir();
}
