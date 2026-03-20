import type { OutputValidationResult } from '@agentsy/shared';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { approvalStatusEnum, stepTypeEnum } from './enums';
import { organizations } from './organizations';
import { runs } from './runs';

export type RunStepMetadata = {
  spanId?: string;
  cacheHit?: boolean;
  retryCount?: number;
  toolCallId?: string;
  [key: string]: unknown;
};

export const runSteps = pgTable(
  'run_steps',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    runId: varchar('run_id', { length: 30 })
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    type: stepTypeEnum('type').notNull(),
    model: varchar('model', { length: 100 }),
    toolName: varchar('tool_name', { length: 255 }),
    input: text('input'),
    output: text('output'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    durationMs: integer('duration_ms'),
    error: text('error'),
    outputTruncated: boolean('output_truncated').notNull().default(false),
    approvalStatus: approvalStatusEnum('approval_status'),
    approvalResolvedBy: varchar('approval_resolved_by', { length: 255 }),
    approvalResolvedAt: timestamp('approval_resolved_at', { withTimezone: true }),
    approvalWaitStartedAt: timestamp('approval_wait_started_at', { withTimezone: true }),
    parsedOutput: jsonb('parsed_output'),
    outputValidation: jsonb('output_validation').$type<OutputValidationResult>(),
    metadata: jsonb('metadata').$type<RunStepMetadata>().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('run_steps_run_id_order_idx').on(table.runId, table.stepOrder),
    index('run_steps_org_id_idx').on(table.orgId),
    index('run_steps_type_idx').on(table.type),
  ],
);
