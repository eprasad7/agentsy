import type { FastifyRequest } from 'fastify';

import type { DbClient } from './db.js';

/**
 * Get the request-scoped DB client (with RLS context) or fall back to the
 * shared pool.  Route handlers should always call `getDb(request, db)` instead
 * of using `db` directly, so that SET LOCAL app.org_id actually applies.
 */
export function getDb(request: FastifyRequest, fallback: DbClient): DbClient {
  return request.scopedDb ?? fallback;
}
