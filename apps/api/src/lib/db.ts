import * as schema from '@agentsy/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';


export type DbClient = ReturnType<typeof createDb>;

export function createDb(connectionString?: string) {
  const url = connectionString ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  const client = postgres(url);
  return drizzle(client, { schema });
}
