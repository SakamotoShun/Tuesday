import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

export const DB_POOL_CONFIG = {
  max: 10,
  idleTimeoutSeconds: 20,
  connectTimeoutSeconds: 10,
} as const;

// Create postgres connection
const client = postgres(config.databaseUrl, {
  max: DB_POOL_CONFIG.max,
  idle_timeout: DB_POOL_CONFIG.idleTimeoutSeconds,
  connect_timeout: DB_POOL_CONFIG.connectTimeoutSeconds,
});

// Create Drizzle database instance
export const db = drizzle(client, { schema });

// Export the postgres client for migrations
export { client };
