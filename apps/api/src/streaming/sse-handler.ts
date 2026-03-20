import type { FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { runEventChannel, runEventLogKey, type RedisRunEvent } from '@agentsy/shared';

/**
 * Handle an SSE connection for a run.
 * Subscribes to Redis pub/sub and forwards events as SSE to the client.
 * Supports Last-Event-ID for reconnection/replay.
 */
export async function handleSSEConnection(
  runId: string,
  reply: FastifyReply,
  lastEventId?: string,
): Promise<void> {
  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    // No Redis — write an error event and close
    writeSseEvent(reply, { id: 1, type: 'run.failed', data: { error: 'Streaming unavailable (no Redis)', error_type: 'internal_error' } });
    reply.raw.end();
    return;
  }

  // Create a dedicated subscriber connection (can't reuse the shared one for pub/sub)
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000 });

  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    subscriber.unsubscribe().catch(() => {});
    subscriber.disconnect();
  };

  // Handle client disconnect
  reply.raw.on('close', cleanup);

  // Replay missed events if Last-Event-ID provided
  if (lastEventId) {
    const lastId = parseInt(lastEventId, 10);
    if (!isNaN(lastId)) {
      try {
        const mainRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
        const eventLog = await mainRedis.lrange(runEventLogKey(runId), 0, -1);
        mainRedis.disconnect();

        for (const raw of eventLog) {
          try {
            const event = JSON.parse(raw) as RedisRunEvent;
            if (event.id > lastId) {
              writeSseEvent(reply, event);
            }
          } catch {
            // Skip malformed entries
          }
        }
      } catch {
        // Replay best-effort
      }
    }
  }

  // Subscribe to live events
  const channel = runEventChannel(runId);

  subscriber.on('message', (_ch: string, message: string) => {
    if (closed) return;
    try {
      const event = JSON.parse(message) as RedisRunEvent;
      writeSseEvent(reply, event);

      // Close connection on terminal events
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) {
        reply.raw.end();
        cleanup();
      }
    } catch {
      // Skip malformed messages
    }
  });

  await subscriber.subscribe(channel);

  // Heartbeat to detect dead connections (every 15s)
  const heartbeat = setInterval(() => {
    if (closed) {
      clearInterval(heartbeat);
      return;
    }
    try {
      reply.raw.write(':heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      cleanup();
    }
  }, 15_000);
}

/**
 * Write a single SSE event to the response stream.
 */
function writeSseEvent(reply: FastifyReply, event: RedisRunEvent): void {
  let output = '';
  if (event.id) output += `id: ${event.id}\n`;
  output += `event: ${event.type}\n`;
  output += `data: ${JSON.stringify(event.data)}\n\n`;
  reply.raw.write(output);
}
