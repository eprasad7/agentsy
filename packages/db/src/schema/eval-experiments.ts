import {
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
import { evalExperimentStatusEnum } from './enums';
import { evalDatasets } from './eval-datasets';
import { organizations } from './organizations';

export type ExperimentConfig = {
  toolMode?: 'mock' | 'dry-run' | 'live';
  graders?: Array<{
    name: string;
    type: string;
    config?: Record<string, unknown>;
  }>;
  parallelism?: number;
  judgeModel?: string;
};

export const evalExperiments = pgTable(
  'eval_experiments',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    datasetId: varchar('dataset_id', { length: 30 })
      .notNull()
      .references(() => evalDatasets.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    versionId: varchar('version_id', { length: 30 })
      .notNull()
      .references(() => agentVersions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }),
    status: evalExperimentStatusEnum('status').notNull().default('queued'),
    summaryScores: jsonb('summary_scores').$type<Record<string, number>>().default({}),
    totalCases: integer('total_cases').notNull().default(0),
    passedCases: integer('passed_cases').notNull().default(0),
    failedCases: integer('failed_cases').notNull().default(0),
    totalCostUsd: doublePrecision('total_cost_usd').notNull().default(0),
    totalDurationMs: integer('total_duration_ms'),
    config: jsonb('config').$type<ExperimentConfig>().default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    commitSha: varchar('commit_sha', { length: 40 }),
    prNumber: integer('pr_number'),
    ciRunUrl: varchar('ci_run_url', { length: 500 }),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('eval_experiments_org_id_idx').on(table.orgId),
    index('eval_experiments_dataset_id_idx').on(table.datasetId),
    index('eval_experiments_agent_id_idx').on(table.agentId),
    index('eval_experiments_version_id_idx').on(table.versionId),
    index('eval_experiments_created_at_idx').on(table.createdAt),
    index('eval_experiments_agent_dataset_created_idx').on(
      table.agentId,
      table.datasetId,
      table.createdAt,
    ),
  ],
);
