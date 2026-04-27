import { config } from '../config';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getMigrationsDir } from '../runtime';
import { log } from '../utils/logger';

const MIGRATION_LOCK_ID = 7100200;

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

async function withMigrationLock<T>(client: postgres.Sql, fn: () => Promise<T>) {
  await client`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;

  try {
    return await fn();
  } finally {
    await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
  }
}

async function executeMigration(client: postgres.Sql, file: string, sql: string) {
  await client`BEGIN`;

  try {
    await client.unsafe(sql);
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
    const statuses = await withMigrationLock(client, () => getMigrationStatuses(client));
    return statuses.filter((status) => !status.applied).length;
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function printMigrationStatus() {
  const client = postgres(config.databaseUrl, { max: 1 });

  try {
    const statuses = await withMigrationLock(client, () => getMigrationStatuses(client));

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
    const statuses = await withMigrationLock(client, () => getMigrationStatuses(client));
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
    await withMigrationLock(client, async () => {
      await ensureMigrationTable(client);

      const { migrationsDir, files } = getMigrationFiles();

      for (const file of files) {
        const [existing] = await client`
          SELECT id FROM drizzle_migrations WHERE name = ${file}
        `;

        if (existing) {
          log('debug', 'migration.skipped', { migration: file, state: 'already_applied' });
          continue;
        }

        const sql = readFileSync(join(migrationsDir, file), 'utf-8');

        try {
          await executeMigration(client, file, sql);
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

  action.catch(() => process.exit(1));
}
