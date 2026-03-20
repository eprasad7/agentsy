import type { RunInput, RunOutput } from '@agentsy/shared';
import { index, integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { evalDatasets } from './eval-datasets';
import { organizations } from './organizations';

export type ExpectedToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
  order?: number;
};

export type MockedToolResult = {
  toolName: string;
  argumentsMatch?: Record<string, unknown>;
  result: unknown;
};

export type TrajectoryStep = {
  type: 'tool_call' | 'response' | 'approval_request';
  toolName?: string;
  contains?: string;
};

export type ApprovalExpectation = {
  shouldRequest: boolean;
  toolName?: string;
  action?: 'approve' | 'deny';
};

export type MemoryExpectation = {
  type: 'session_write' | 'knowledge_update';
  key?: string;
  valueContains?: string;
};

export const evalDatasetCases = pgTable(
  'eval_dataset_cases',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    datasetId: varchar('dataset_id', { length: 30 })
      .notNull()
      .references(() => evalDatasets.id, { onDelete: 'cascade' }),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    input: jsonb('input').$type<RunInput>().notNull(),
    expectedOutput: jsonb('expected_output').$type<RunOutput>(),
    expectedToolCalls: jsonb('expected_tool_calls').$type<ExpectedToolCall[]>().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    mockedToolResults: jsonb('mocked_tool_results').$type<MockedToolResult[]>().default([]),
    sessionHistory: jsonb('session_history')
      .$type<Array<{ role: string; content: string }>>()
      .default([]),
    expectedTrajectory: jsonb('expected_trajectory').$type<TrajectoryStep[]>().default([]),
    expectedApprovalBehavior: jsonb('expected_approval_behavior').$type<ApprovalExpectation>(),
    expectedCitations: jsonb('expected_citations').$type<string[]>().default([]),
    expectedMemoryWrites: jsonb('expected_memory_writes').$type<MemoryExpectation[]>().default([]),
    tags: jsonb('tags').$type<string[]>().default([]),
    caseOrder: integer('case_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('eval_dataset_cases_dataset_id_idx').on(table.datasetId),
    index('eval_dataset_cases_org_id_idx').on(table.orgId),
  ],
);
