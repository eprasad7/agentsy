import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { checkRequestRateLimit, PLAN_LIMITS } from '../lib/rate-limiter.js';
import { getRedis } from '../lib/redis.js';
import { rateLimitExceeded } from '../plugins/error-handler.js';

const PUBLIC_ROUTES = ['/health', '/api/auth'];

export function registerRateLimitMiddleware(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (PUBLIC_ROUTES.some((r) => request.url.startsWith(r))) return;
    if (!request.orgId) return;

    const redis = getRedis();
    if (!redis) {
      // Redis unavailable — fail open
      request.log.warn('Redis unavailable, skipping rate limit check');
      return;
    }

    const plan = request.orgPlan ?? 'free';
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS['free']!;

    try {
      const result = await checkRequestRateLimit(redis, request.orgId, limits.requestsPerMin);

      // Always set headers
      for (const [header, value] of Object.entries(result.headers)) {
        reply.header(header, value);
      }

      if (!result.allowed) {
        throw rateLimitExceeded('Request rate limit exceeded. Please retry after the reset time.');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'ApiError') throw err;
      // Redis error — fail open
      request.log.warn({ err }, 'Rate limiter error, allowing request');
    }
  });
}
