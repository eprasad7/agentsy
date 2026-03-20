import * as schema from '@agentsy/db';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import postgres from 'postgres';

import type { DbClient } from '../lib/db.js';

/**
 * RLS context middleware.
 *
 * For each authenticated request, acquires a **dedicated** connection from a
 * single-connection pool so that BEGIN / SET LOCAL / queries / COMMIT all
 * run on the same socket.  The scoped DB client is attached to
 * `request.scopedDb` — route handlers should use `request.scopedDb ?? db`
 * to ensure RLS applies.
 */
export function registerRlsMiddleware(app: FastifyInstance, _db: DbClient): void {
  app.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const orgId = request.orgId;
    if (!orgId) return;

    const url = process.env['DATABASE_URL'];
    if (!url) return;

    // Reserve a single connection so the entire request stays on one socket
    const reserved = postgres(url, { max: 1 });
    const scopedDb = drizzle(reserved, { schema });

    await scopedDb.execute(sql`BEGIN`);
    await scopedDb.execute(sql.raw(`SET LOCAL app.org_id = '${orgId}'`));

    const ext = request as RequestWithScoped;
    ext.scopedDb = scopedDb;
    ext._reservedConn = reserved;
  });

  // Commit on successful response
  app.addHook('onResponse', async (request: FastifyRequest, _reply: FastifyReply) => {
    const ext = request as RequestWithScoped;
    if (ext.scopedDb) {
      try { await ext.scopedDb.execute(sql`COMMIT`); } catch { /* already committed */ }
      try { await ext._reservedConn?.end(); } catch { /* best effort */ }
      ext.scopedDb = undefined;
      ext._reservedConn = undefined;
    }
  });

  // Rollback on error
  app.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, _error: Error) => {
    const ext = request as RequestWithScoped;
    if (ext.scopedDb) {
      try { await ext.scopedDb.execute(sql`ROLLBACK`); } catch { /* best effort */ }
      try { await ext._reservedConn?.end(); } catch { /* best effort */ }
      ext.scopedDb = undefined;
      ext._reservedConn = undefined;
    }
  });
}

interface RequestWithScoped extends FastifyRequest {
  scopedDb?: DbClient;
  _reservedConn?: postgres.Sql;
}
