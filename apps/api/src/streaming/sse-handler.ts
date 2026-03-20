import { runEventChannel, runEventLogKey, type RedisRunEvent } from '@agentsy/shared';
import type { FastifyReply } from 'fastify';
import { Redis } from 'ioredis';

/**
 * Handle an SSE connection for a run.
 * Subscribes to Redis pub/sub and forwards events as SSE to the client.
 * Supports Last-Event-ID for reconnection/replay.
 *
 * To avoid race conditions where events are published before the subscriber
 * connects, we always replay from the event log first, then subscribe to live.
 */
export async function handleSSEConnection(
  runId: string,
  reply: FastifyReply,
  lastEventId?: string,
): Promise<void> {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    writeSseEvent(reply, { id: 1, type: 'run.failed', data: { error: 'Streaming unavailable (no Redis)', error_type: 'internal_error' } });
    reply.raw.end();
    return;
  }

  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
  // eslint-disable-next-line prefer-const -- reassigned in closure below
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    subscriber.unsubscribe().catch(() => {});
    subscriber.disconnect();
  };

  reply.raw.on('close', cleanup);

  // Subscribe to live channel FIRST (before replay) to avoid missing events
  // published between replay and subscribe
  const channel = runEventChannel(runId);
  const liveEventBuffer: string[] = [];
  let replayDone = false;

  subscriber.on('message', (_ch: string, message: string) => {
    if (closed) return;
    if (!replayDone) {
      // Buffer live events that arrive during replay
      liveEventBuffer.push(message);
      return;
    }
    processMessage(message);
  });

  await subscriber.subscribe(channel);

  // Replay events from the persisted log to catch anything published before subscribe
  let highestReplayedId = 0;
  const lastId = lastEventId ? parseInt(lastEventId, 10) : 0;

  try {
    const replayRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
    const eventLog = await replayRedis.lrange(runEventLogKey(runId), 0, -1);
    replayRedis.disconnect();

    for (const raw of eventLog) {
      try {
        const event = JSON.parse(raw) as RedisRunEvent;
        if (event.id > lastId) {
          writeSseEvent(reply, event);
          if (event.id > highestReplayedId) highestReplayedId = event.id;

          // If we replayed a terminal event, the run is already done
          if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) {
            reply.raw.end();
            cleanup();
            return;
          }
        }
      } catch {
        // Skip malformed
      }
    }
  } catch {
    // Replay best-effort
  }

  // Flush buffered live events (de-duplicating with replayed events)
  replayDone = true;
  for (const msg of liveEventBuffer) {
    try {
      const event = JSON.parse(msg) as RedisRunEvent;
      if (event.id > highestReplayedId) {
        processMessage(msg);
      }
    } catch {
      // Skip
    }
  }
  liveEventBuffer.length = 0;

  // Heartbeat every 15s
  heartbeat = setInterval(() => {
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

  function processMessage(message: string) {
    if (closed) return;
    try {
      const event = JSON.parse(message) as RedisRunEvent;
      writeSseEvent(reply, event);

      if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) {
        reply.raw.end();
        cleanup();
      }
    } catch {
      // Skip malformed
    }
  }
}

function writeSseEvent(reply: FastifyReply, event: RedisRunEvent): void {
  let output = '';
  if (event.id) output += `id: ${event.id}\n`;
  output += `event: ${event.type}\n`;
  output += `data: ${JSON.stringify(event.data)}\n\n`;
  reply.raw.write(output);
}
