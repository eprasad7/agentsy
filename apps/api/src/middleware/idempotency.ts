import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { getRedis } from '../lib/redis.js';

const IDEMPOTENCY_TTL = 86400; // 24 hours

export function registerIdempotencyMiddleware(app: FastifyInstance): void {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method !== 'POST' && request.method !== 'PATCH') return;

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) return;
    if (!request.orgId) return;

    const redis = getRedis();
    if (!redis) return;

    const cacheKey = `idempotency:${request.orgId}:${idempotencyKey}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const { status, body } = JSON.parse(cached) as { status: number; body: unknown };
        reply.status(status).send(body);
        return;
      }

      // Store a flag that we're processing this key
      // The response will be cached in the onSend hook
      (request as { idempotencyCacheKey?: string }).idempotencyCacheKey = cacheKey;
    } catch (err) {
      request.log.warn({ err }, 'Idempotency check failed, proceeding normally');
    }
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const cacheKey = (request as { idempotencyCacheKey?: string }).idempotencyCacheKey;
    if (!cacheKey) return payload;

    const redis = getRedis();
    if (!redis) return payload;

    try {
      const cacheValue = JSON.stringify({
        status: reply.statusCode,
        body: typeof payload === 'string' ? JSON.parse(payload) : payload,
      });
      await redis.set(cacheKey, cacheValue, 'EX', IDEMPOTENCY_TTL);
    } catch {
      // Non-critical
    }

    return payload;
  });
}
