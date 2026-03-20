import {
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const usageDaily = pgTable(
  'usage_daily',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    totalRuns: integer('total_runs').notNull().default(0),
    completedRuns: integer('completed_runs').notNull().default(0),
    failedRuns: integer('failed_runs').notNull().default(0),
    totalTokensIn: bigint('total_tokens_in', { mode: 'number' }).notNull().default(0),
    totalTokensOut: bigint('total_tokens_out', { mode: 'number' }).notNull().default(0),
    totalCostUsd: doublePrecision('total_cost_usd').notNull().default(0),
    totalDurationMs: bigint('total_duration_ms', { mode: 'number' }).notNull().default(0),
    runsByModel: jsonb('runs_by_model').$type<Record<string, number>>().default({}),
    costByModel: jsonb('cost_by_model').$type<Record<string, number>>().default({}),
    runsByAgent: jsonb('runs_by_agent').$type<Record<string, number>>().default({}),
    costByAgent: jsonb('cost_by_agent').$type<Record<string, number>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('usage_daily_org_date_idx').on(table.orgId, table.date),
    index('usage_daily_date_idx').on(table.date),
  ],
);
