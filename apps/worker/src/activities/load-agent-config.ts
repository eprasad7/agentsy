import { agentVersions, createPgClient, eq } from '@agentsy/db';

export interface AgentVersionConfig {
  id: string;
  agentId: string;
  version: number;
  systemPrompt: string;
  model: string;
  modelSpec: unknown;
  fallbackModel: string | null;
  toolsConfig: unknown[];
  guardrailsConfig: Record<string, unknown>;
  modelParams: Record<string, unknown>;
  outputConfig: { mode: 'text' | 'json'; json_schema?: Record<string, unknown>; strict?: boolean };
}

let db: ReturnType<typeof createPgClient> | undefined;

function getDb() {
  if (db) return db;
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required for worker');
  db = createPgClient(url);
  return db;
}

/**
 * Activity: Load agent version config from Postgres.
 */
export async function loadAgentConfig(versionId: string): Promise<AgentVersionConfig> {
  const database = getDb();
  const result = await database
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.id, versionId))
    .limit(1);

  if (!result[0]) throw new Error(`Agent version ${versionId} not found`);

  const row = result[0];
  return {
    id: row.id,
    agentId: row.agentId,
    version: row.version,
    systemPrompt: row.systemPrompt,
    model: row.model,
    modelSpec: row.modelSpec,
    fallbackModel: row.fallbackModel,
    toolsConfig: (row.toolsConfig ?? []) as unknown[],
    guardrailsConfig: (row.guardrailsConfig ?? {}) as Record<string, unknown>,
    modelParams: (row.modelParams ?? {}) as Record<string, unknown>,
    outputConfig: (row.outputConfig ?? { mode: 'text' }) as { mode: 'text' | 'json'; json_schema?: Record<string, unknown>; strict?: boolean },
  };
}
