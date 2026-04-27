import { config } from '../config';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { log } from '../utils/logger';
import { getMigrationsDir } from '../utils/runtime-paths';

const MIGRATION_LOCK_ID = 7100200;
const MIGRATION_LOCK_TIMEOUT_MS = 10_000;
const MIGRATION_LOCK_RETRY_MS = 200;

type MigrationStatus = {
  name: string;
  applied: boolean;
  executedAt: string | null;
};

async function ensureMigrationTable(client: postgres.Sql) {
  await client`
    CREATE TABLE IF NOT EXISTS drizzle_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
}

function getMigrationFiles() {
  const migrationsDir = getMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return { migrationsDir, files };
}

async function getMigrationStatuses(client: postgres.Sql): Promise<MigrationStatus[]> {
  await ensureMigrationTable(client);
  const { files } = getMigrationFiles();
  const executed = await client<{ name: string; executed_at: string }[]>`
    SELECT name, executed_at::text AS executed_at
    FROM drizzle_migrations
    ORDER BY name ASC
  `;
  const executedByName = new Map(executed.map((row) => [row.name, row.executed_at]));

  return files.map((name) => ({
    name,
    applied: executedByName.has(name),
    executedAt: executedByName.get(name) ?? null,
  }));
}

async function withMigrationLock<T>(client: postgres.Sql, fn: (sql: postgres.Sql) => Promise<T>) {
  const reserved = await client.reserve();
  let lockAcquired = false;

  try {
    const sql = reserved as unknown as postgres.Sql;
    const deadline = Date.now() + MIGRATION_LOCK_TIMEOUT_MS;

    while (!lockAcquired) {
      const [{ acquired }] = await sql<{ acquired: boolean }[]>`SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) AS acquired`;
      lockAcquired = acquired;

      if (lockAcquired) {
        break;
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for migration lock after ${MIGRATION_LOCK_TIMEOUT_MS}ms`);
      }

      await Bun.sleep(MIGRATION_LOCK_RETRY_MS);
    }

    try {
      return await fn(sql);
    } finally {
      if (lockAcquired) {
        await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
      }
    }
  } finally {
    reserved.release();
  }
}

async function executeMigration(client: postgres.Sql, file: string, statement: string) {
  await client`BEGIN`;

  try {
    await client.unsafe(statement);
    await client`
      INSERT INTO drizzle_migrations (name) VALUES (${file})
    `;
    await client`COMMIT`;
  } catch (error) {
    await client`ROLLBACK`;
    throw error;
  }
}

export async function getPendingMigrationCount() {
  const client = postgres(config.databaseUrl, { max: 1 });

  try {
    const statuses = await withMigrationLock(client, (sql) => getMigrationStatuses(sql));
    return statuses.filter((status) => !status.applied).length;
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function printMigrationStatus() {
  const client = postgres(config.databaseUrl, { max: 1 });

  try {
    const statuses = await withMigrationLock(client, (sql) => getMigrationStatuses(sql));

    for (const status of statuses) {
      const label = status.applied ? 'applied' : 'pending';
      const executedAt = status.executedAt ? ` at ${status.executedAt}` : '';
      log('info', 'migration.status', {
        migration: status.name,
        state: label,
        executed_at: status.executedAt,
      });
      console.log(`${status.name} - ${label}${executedAt}`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function dryRunMigrations() {
  const client = postgres(config.databaseUrl, { max: 1 });

  try {
    const statuses = await withMigrationLock(client, (sql) => getMigrationStatuses(sql));
    const pending = statuses.filter((status) => !status.applied);

    if (pending.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log('Pending migrations:');
    for (const migration of pending) {
      console.log(`- ${migration.name}`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function runMigrations() {
  log('info', 'migration.run_started');
  
  const client = postgres(config.databaseUrl, {
    max: 1, // Single connection for migrations
  });

  try {
    await withMigrationLock(client, async (sql) => {
      await ensureMigrationTable(sql);

      const { migrationsDir, files } = getMigrationFiles();

      for (const file of files) {
        const [existing] = await sql`
          SELECT id FROM drizzle_migrations WHERE name = ${file}
        `;

        if (existing) {
          log('debug', 'migration.skipped', { migration: file, state: 'already_applied' });
          continue;
        }

        const statement = readFileSync(join(migrationsDir, file), 'utf-8');

        try {
          await executeMigration(sql, file, statement);
          log('info', 'migration.applied', { migration: file });
        } catch (error) {
          log('error', 'migration.failed', {
            migration: file,
            error,
          });
          throw error;
        }
      }
    });

    log('info', 'migration.run_completed');
  } catch (error) {
    log('error', 'migration.run_failed', { error });
    throw error;
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  const command = Bun.argv[2] || 'up';

  const action = command === 'status'
    ? printMigrationStatus()
    : command === 'dry-run'
      ? dryRunMigrations()
      : runMigrations();

  action.catch((error) => {
    log('error', 'migration.cli_failed', { command, error });
    process.exit(1);
  });
}
