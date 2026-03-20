import type { FastifyInstance } from 'fastify';

import { isRedisHealthy } from '../lib/redis.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const redisOk = await isRedisHealthy();
    return {
      status: 'ok',
      redis: redisOk,
    };
  });
}
