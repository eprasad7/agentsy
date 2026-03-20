import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { evalDatasetCases } from './eval-dataset-cases';
import { evalExperiments } from './eval-experiments';
import { organizations } from './organizations';
import { runs } from './runs';

export type DbScoreResult = {
  score: number;
  name: string;
  graderType: string;
  reasoning?: string;
  metadata?: Record<string, unknown>;
};

export const evalExperimentResults = pgTable(
  'eval_experiment_results',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    experimentId: varchar('experiment_id', { length: 30 })
      .notNull()
      .references(() => evalExperiments.id, { onDelete: 'cascade' }),
    caseId: varchar('case_id', { length: 30 })
      .notNull()
      .references(() => evalDatasetCases.id, { onDelete: 'cascade' }),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    runId: varchar('run_id', { length: 30 }).references(() => runs.id, { onDelete: 'set null' }),
    output: text('output'),
    scores: jsonb('scores').$type<Record<string, DbScoreResult>>().default({}),
    passed: boolean('passed'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('eval_experiment_results_experiment_id_idx').on(table.experimentId),
    index('eval_experiment_results_case_id_idx').on(table.caseId),
    index('eval_experiment_results_org_id_idx').on(table.orgId),
  ],
);
