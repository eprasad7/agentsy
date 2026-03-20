import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { DbClient } from '../lib/db.js';
import { isRedisHealthy } from '../lib/redis.js';

export async function healthRoutes(app: FastifyInstance, db?: DbClient): Promise<void> {
  app.get('/health', async () => {
    let dbOk = false;
    if (db) {
      try {
        await db.execute(sql`SELECT 1`);
        dbOk = true;
      } catch {
        dbOk = false;
      }
    }

    const redisOk = await isRedisHealthy();

    return {
      status: 'ok',
      db: dbOk,
      redis: redisOk,
    };
  });
}
