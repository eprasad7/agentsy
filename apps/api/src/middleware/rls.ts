import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DbClient } from '../lib/db.js';

export function registerRlsMiddleware(app: FastifyInstance, db: DbClient): void {
  app.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const orgId = request.orgId;
    if (!orgId) return;

    // Set RLS context for this request
    await db.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`);
  });
}
