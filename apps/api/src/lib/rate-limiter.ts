import type { Redis } from 'ioredis';

export interface RateLimitConfig {
  requestsPerMin: number;
  tokensPerDay: number;
  concurrentRuns: number;
}

export const PLAN_LIMITS: Record<string, RateLimitConfig> = {
  free: { requestsPerMin: 20, tokensPerDay: 100_000, concurrentRuns: 2 },
  pro: { requestsPerMin: 60, tokensPerDay: 1_000_000, concurrentRuns: 10 },
  team: { requestsPerMin: 120, tokensPerDay: 5_000_000, concurrentRuns: 25 },
  enterprise: { requestsPerMin: 300, tokensPerDay: 50_000_000, concurrentRuns: 100 },
};

export interface RateLimitResult {
  allowed: boolean;
  headers: Record<string, string>;
}

export async function checkRequestRateLimit(
  redis: Redis,
  orgId: string,
  limit: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = 60_000;
  const windowStart = now - windowMs;
  const key = `ratelimit:req:${orgId}`;

  const pipeline = redis.pipeline();
  // Remove entries outside the window
  pipeline.zremrangebyscore(key, '-inf', windowStart);
  // Add current request
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
  // Count requests in window
  pipeline.zcard(key);
  // Set expiry
  pipeline.expire(key, 120);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;
  const remaining = Math.max(0, limit - count);
  const resetAt = new Date(now + windowMs).toISOString();

  return {
    allowed: count <= limit,
    headers: {
      'X-RateLimit-Limit-Requests': limit.toString(),
      'X-RateLimit-Remaining-Requests': remaining.toString(),
      'X-RateLimit-Reset-Requests': resetAt,
    },
  };
}
