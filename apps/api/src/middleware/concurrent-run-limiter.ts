import { PLAN_LIMITS } from '../lib/rate-limiter.js';
import { getRedis } from '../lib/redis.js';
import { rateLimitExceeded } from '../plugins/error-handler.js';

const MAX_RUN_TTL = 600; // 10 min safety net TTL

export async function acquireRunSlot(orgId: string, plan: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // Fail open

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS['free']!;
  const key = `concurrent:${orgId}`;

  try {
    const current = await redis.incr(key);
    await redis.expire(key, MAX_RUN_TTL);

    if (current > limits.concurrentRuns) {
      await redis.decr(key);
      return false;
    }

    return true;
  } catch {
    return true; // Fail open
  }
}

export async function releaseRunSlot(orgId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `concurrent:${orgId}`;
  try {
    const val = await redis.decr(key);
    if (val < 0) await redis.set(key, '0');
  } catch {
    // Non-critical
  }
}

export async function checkConcurrentRunLimit(orgId: string, plan: string): Promise<void> {
  const allowed = await acquireRunSlot(orgId, plan);
  if (!allowed) {
    throw rateLimitExceeded(
      'Concurrent run limit exceeded. Wait for running agents to complete.',
    );
  }
}
