import * as schema from '@agentsy/db';
import { sql } from 'drizzle-orm';
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

/**
 * Acquire a dedicated connection from the pool, run a callback within a
 * transaction that has `app.org_id` set via SET LOCAL, then release.
 *
 * This ensures RLS applies to every query inside the callback regardless
 * of connection pool interleaving.
 */
export async function withRlsTransaction<T>(
  orgId: string,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');

  // Reserve a single connection so BEGIN/SET LOCAL/COMMIT stay on the same socket
  const reserved = postgres(url, { max: 1 });
  const txDb = drizzle(reserved, { schema });

  try {
    await txDb.execute(sql`BEGIN`);
    await txDb.execute(sql.raw(`SET LOCAL app.org_id = '${orgId}'`));
    const result = await fn(txDb);
    await txDb.execute(sql`COMMIT`);
    return result;
  } catch (err) {
    try { await txDb.execute(sql`ROLLBACK`); } catch { /* already rolled back */ }
    throw err;
  } finally {
    await reserved.end();
  }
}
