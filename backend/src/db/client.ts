import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

// Create postgres connection
const client = postgres(config.databaseUrl, {
  max: 10, // Connection pool size
  idle_timeout: 20, // Idle timeout in seconds
  connect_timeout: 10, // Connection timeout in seconds
});

// Create Drizzle database instance
export const db = drizzle(client, { schema });

// Export the postgres client for migrations
export { client };
