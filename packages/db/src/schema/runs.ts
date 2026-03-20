import type { RunInput, RunOutput, OutputValidationResult } from '@agentsy/shared';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { agentVersions } from './agent-versions';
import { agents } from './agents';
import { runStatusEnum } from './enums';
import { environments } from './environments';
import { organizations } from './organizations';
import { sessions } from './sessions';

export type RunMetadata = {
  source?: 'api' | 'playground' | 'eval' | 'cli';
  apiKeyId?: string;
  userAgent?: string;
  ip?: string;
  [key: string]: unknown;
};

export const runs = pgTable(
  'runs',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    versionId: varchar('version_id', { length: 30 }).references(() => agentVersions.id, {
      onDelete: 'set null',
    }),
    sessionId: varchar('session_id', { length: 30 }).references(() => sessions.id, {
      onDelete: 'set null',
    }),
    parentRunId: varchar('parent_run_id', { length: 30 }),
    environmentId: varchar('environment_id', { length: 30 })
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    status: runStatusEnum('status').notNull().default('queued'),
    input: jsonb('input').$type<RunInput>().notNull(),
    output: jsonb('output').$type<RunOutput>(),
    error: text('error'),
    totalTokensIn: integer('total_tokens_in').notNull().default(0),
    totalTokensOut: integer('total_tokens_out').notNull().default(0),
    totalCostUsd: doublePrecision('total_cost_usd').notNull().default(0),
    durationMs: integer('duration_ms'),
    model: varchar('model', { length: 100 }),
    temporalWorkflowId: varchar('temporal_workflow_id', { length: 255 }),
    traceId: varchar('trace_id', { length: 64 }),
    outputValid: boolean('output_valid'),
    outputValidation: jsonb('output_validation').$type<OutputValidationResult>(),
    metadata: jsonb('metadata').$type<RunMetadata>().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('runs_org_id_idx').on(table.orgId),
    index('runs_agent_id_idx').on(table.agentId),
    index('runs_session_id_idx').on(table.sessionId),
    index('runs_parent_run_id_idx').on(table.parentRunId),
    index('runs_status_idx').on(table.status),
    index('runs_created_at_idx').on(table.createdAt),
    index('runs_trace_id_idx').on(table.traceId),
    index('runs_agent_status_created_idx').on(table.agentId, table.status, table.createdAt),
    index('runs_org_created_idx').on(table.orgId, table.createdAt),
    index('runs_org_env_created_idx').on(table.orgId, table.environmentId, table.createdAt),
  ],
);
