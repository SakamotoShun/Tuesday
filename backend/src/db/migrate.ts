import { config } from '../config';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export async function runMigrations() {
  console.log('Running migrations...');
  
  const client = postgres(config.databaseUrl, {
    max: 1, // Single connection for migrations
  });

  try {
    // Create migrations tracking table
    await client`
      CREATE TABLE IF NOT EXISTS drizzle_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `;

    // Get migration files
    const migrationsDir = join(import.meta.dir, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Run each migration
    for (const file of files) {
      // Check if already executed
      const [existing] = await client`
        SELECT id FROM drizzle_migrations WHERE name = ${file}
      `;

      if (existing) {
        console.log(`  ✓ ${file} (already executed)`);
        continue;
      }

      // Execute migration
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      await client.unsafe(sql);
      
      // Record migration
      await client`
        INSERT INTO drizzle_migrations (name) VALUES (${file})
      `;

      console.log(`  ✓ ${file} (executed)`);
    }

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  runMigrations().catch(() => process.exit(1));
}
