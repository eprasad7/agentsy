import { runSteps, createPgClient } from '@agentsy/db';
import { newId } from '@agentsy/shared';

export interface PersistRunStepInput {
  id?: string;  // Pre-generated step ID (if not provided, one is generated)
  runId: string;
  orgId: string;
  stepOrder: number;
  type: 'llm_call' | 'tool_call' | 'retrieval' | 'guardrail' | 'approval_request';
  model?: string;
  toolName?: string;
  input?: string;
  output?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
  error?: string;
  outputTruncated?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'denied';
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
 * Activity: Write a run_step row to Postgres.
 */
export async function persistRunStep(input: PersistRunStepInput): Promise<string> {
  const database = getDb();
  const id = input.id ?? newId('stp');
  const now = new Date();

  await database.insert(runSteps).values({
    id,
    runId: input.runId,
    orgId: input.orgId,
    stepOrder: input.stepOrder,
    type: input.type,
    model: input.model ?? null,
    toolName: input.toolName ?? null,
    input: input.input ?? null,
    output: input.output ?? null,
    tokensIn: input.tokensIn ?? 0,
    tokensOut: input.tokensOut ?? 0,
    costUsd: input.costUsd ?? 0,
    durationMs: input.durationMs ?? null,
    error: input.error ?? null,
    outputTruncated: input.outputTruncated ?? false,
    approvalStatus: input.approvalStatus ?? null,
    metadata: input.metadata ?? {},
    startedAt: now,
    completedAt: now,
    createdAt: now,
  });

  return id;
}
