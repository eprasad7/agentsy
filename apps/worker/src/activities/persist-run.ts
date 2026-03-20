import { runs, createPgClient, eq } from '@agentsy/db';
import type { RunOutput } from '@agentsy/shared';

export interface PersistRunInput {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  output?: RunOutput;
  error?: string;
  model?: string;
  totalTokensIn?: number;
  totalTokensOut?: number;
  totalCostUsd?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

let db: ReturnType<typeof createPgClient> | undefined;

function getDb() {
  if (db) return db;
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  db = createPgClient(url);
  return db;
}

/**
 * Activity: Update the runs row with final status/output/cost.
 */
export async function persistRun(input: PersistRunInput): Promise<void> {
  const database = getDb();
  const now = new Date();

  const updates: Record<string, unknown> = {
    status: input.status,
    updatedAt: now,
  };

  if (input.output) updates['output'] = input.output;
  if (input.error) updates['error'] = input.error;
  if (input.model) updates['model'] = input.model;
  if (input.totalTokensIn !== undefined) updates['totalTokensIn'] = input.totalTokensIn;
  if (input.totalTokensOut !== undefined) updates['totalTokensOut'] = input.totalTokensOut;
  if (input.totalCostUsd !== undefined) updates['totalCostUsd'] = input.totalCostUsd;
  if (input.durationMs !== undefined) updates['durationMs'] = input.durationMs;

  if (['completed', 'failed', 'cancelled', 'timeout'].includes(input.status)) {
    updates['completedAt'] = now;
  }

  if (input.status === 'running') {
    updates['startedAt'] = now;
  }

  await database.update(runs).set(updates).where(eq(runs.id, input.runId));
}
