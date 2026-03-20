import { boolean, index, jsonb, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { agentVersions } from './agent-versions';
import { agents } from './agents';
import { evalDatasets } from './eval-datasets';
import { evalExperiments } from './eval-experiments';
import { organizations } from './organizations';

export const evalBaselines = pgTable(
  'eval_baselines',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    datasetId: varchar('dataset_id', { length: 30 })
      .notNull()
      .references(() => evalDatasets.id, { onDelete: 'cascade' }),
    experimentId: varchar('experiment_id', { length: 30 })
      .notNull()
      .references(() => evalExperiments.id, { onDelete: 'cascade' }),
    versionId: varchar('version_id', { length: 30 })
      .notNull()
      .references(() => agentVersions.id, { onDelete: 'cascade' }),
    summaryScores: jsonb('summary_scores').$type<Record<string, number>>().notNull(),
    perCaseScores: jsonb('per_case_scores')
      .$type<Record<string, Record<string, number>>>()
      .notNull(),
    isActive: boolean('is_active').notNull().default(true),
    setBy: varchar('set_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('eval_baselines_active_unique_idx')
      .on(table.agentId, table.datasetId)
      .where(sql`is_active = true`),
    index('eval_baselines_org_id_idx').on(table.orgId),
  ],
);
