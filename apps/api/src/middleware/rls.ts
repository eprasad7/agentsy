import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DbClient } from '../lib/db.js';

/**
 * RLS context middleware.
 *
 * For each authenticated request:
 * 1. Begins a transaction
 * 2. SET LOCAL app.org_id (only visible within the transaction)
 * 3. Commits on successful response
 * 4. Rolls back on error
 *
 * SET LOCAL requires an active transaction — without BEGIN, it's a no-op.
 */
export function registerRlsMiddleware(app: FastifyInstance, db: DbClient): void {
  app.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const orgId = request.orgId;
    if (!orgId) return;

    // Begin transaction and set RLS context
    await db.execute(sql`BEGIN`);
    await db.execute(sql`SET LOCAL app.org_id = ${orgId}`);

    // Mark that we have an open transaction to commit/rollback later
    (request as RequestWithTx).hasTx = true;
  });

  // Commit on successful response
  app.addHook('onResponse', async (request: FastifyRequest, _reply: FastifyReply) => {
    if ((request as RequestWithTx).hasTx) {
      try {
        await db.execute(sql`COMMIT`);
      } catch {
        // Already committed or connection issue — non-fatal
      }
    }
  });

  // Rollback on error
  app.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, _error: Error) => {
    if ((request as RequestWithTx).hasTx) {
      try {
        await db.execute(sql`ROLLBACK`);
      } catch {
        // Already rolled back or connection issue — non-fatal
      }
      (request as RequestWithTx).hasTx = false;
    }
  });
}

interface RequestWithTx extends FastifyRequest {
  hasTx?: boolean;
}
