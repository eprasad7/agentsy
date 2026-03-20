import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import postgres from 'postgres';
import Database from 'better-sqlite3';

import * as schema from './schema/index';

export type DbClient = ReturnType<typeof createPgClient> | ReturnType<typeof createSqliteClient>;

export function createPgClient(connectionString: string) {
  const client = postgres(connectionString);
  return drizzlePg(client, { schema });
}

export function createSqliteClient(dbPath: string = ':memory:') {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  return drizzleSqlite(sqlite);
}

export function createClient() {
  const env = process.env['NODE_ENV'] ?? 'development';
  const databaseUrl = process.env['DATABASE_URL'];

  if (env === 'development' && !databaseUrl) {
    const dbPath = process.env['SQLITE_PATH'] ?? 'local.db';
    return createSqliteClient(dbPath);
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }

  return createPgClient(databaseUrl);
}
