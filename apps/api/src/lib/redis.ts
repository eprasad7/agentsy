import { Redis } from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env['REDIS_URL'];
  if (!url) return null;

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    redis.on('error', (err: Error) => {
      console.warn('[redis] connection error:', err.message);
    });

    return redis;
  } catch {
    return null;
  }
}

export async function isRedisHealthy(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const result = await r.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
