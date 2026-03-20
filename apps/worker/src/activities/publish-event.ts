import type { RunStreamEvent } from '@agentsy/shared';

import { publishRunEvent, cleanupRunSequence } from '../streaming/event-emitter.js';

/**
 * Activity: Publish a run event to Redis for SSE streaming.
 */
export async function emitRunEvent(runId: string, event: RunStreamEvent): Promise<void> {
  await publishRunEvent(runId, event);
}

/**
 * Activity: Clean up event sequence counter when a run finishes.
 */
export async function cleanupRunEvents(runId: string): Promise<void> {
  cleanupRunSequence(runId);
}
