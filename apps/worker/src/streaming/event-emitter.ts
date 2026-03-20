import { runEventChannel, runEventLogKey, type RunStreamEvent, type RedisRunEvent } from '@agentsy/shared';
import { Redis } from 'ioredis';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env['REDIS_URL'];
  if (!url) return null;
  redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  redis.on('error', () => {}); // Suppress unhandled errors
  return redis;
}

// Per-run sequence counter
const sequenceCounters = new Map<string, number>();

function nextSequenceId(runId: string): number {
  const current = sequenceCounters.get(runId) ?? 0;
  const next = current + 1;
  sequenceCounters.set(runId, next);
  return next;
}

/**
 * Publish a run event to Redis pub/sub and persist to the event log.
 * Non-blocking — silently fails if Redis is unavailable.
 */
export async function publishRunEvent(runId: string, event: RunStreamEvent): Promise<void> {
  const r = getRedis();
  if (!r) return;

  const id = nextSequenceId(runId);
  const { type, ...data } = event;
  const wireEvent: RedisRunEvent = { id, type, data: data as Record<string, unknown> };
  const payload = JSON.stringify(wireEvent);

  try {
    // Publish to channel for live subscribers
    await r.publish(runEventChannel(runId), payload);

    // Persist to list for Last-Event-ID replay (expire after 1 hour)
    const logKey = runEventLogKey(runId);
    await r.rpush(logKey, payload);
    await r.expire(logKey, 3600);
  } catch {
    // Non-critical — streaming degrades gracefully
  }
}

/**
 * Clean up sequence counter for a completed run.
 */
export function cleanupRunSequence(runId: string): void {
  sequenceCounters.delete(runId);
}
