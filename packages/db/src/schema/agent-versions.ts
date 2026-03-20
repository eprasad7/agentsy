import type { ResponseOutputConfig } from '@agentsy/shared';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { organizations } from './organizations';

export type VersionModelSpec =
  | { type: 'direct'; model: string }
  | { type: 'class'; class: 'reasoning' | 'balanced' | 'fast'; provider?: 'anthropic' | 'openai' };

export type VersionToolsConfig = Array<{
  name: string;
  type: 'native' | 'mcp';
  description?: string;
  inputSchema?: Record<string, unknown>;
  mcpServerUrl?: string;
  mcpTransport?: 'stdio' | 'streamable-http';
  timeout?: number;
  riskLevel?: 'read' | 'write' | 'admin';
  approvalPolicy?: {
    autoApprove?: boolean;
    requireApproval?: boolean;
    requireApprovalIn?: Array<'development' | 'staging' | 'production'>;
  };
}>;

export type VersionGuardrailsConfig = {
  maxIterations?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxToolResultSize?: number;
  outputValidation?: Array<{
    type: 'no_pii' | 'on_topic' | 'content_policy' | 'custom';
    config?: Record<string, unknown>;
  }>;
};

export type VersionModelParams = {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
};

export const agentVersions = pgTable(
  'agent_versions',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    agentId: varchar('agent_id', { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    modelSpec: jsonb('model_spec').$type<VersionModelSpec>(),
    fallbackModel: varchar('fallback_model', { length: 100 }),
    toolsConfig: jsonb('tools_config').$type<VersionToolsConfig>().notNull().default([]),
    guardrailsConfig: jsonb('guardrails_config')
      .$type<VersionGuardrailsConfig>()
      .notNull()
      .default({}),
    modelParams: jsonb('model_params').$type<VersionModelParams>().default({}),
    outputConfig: jsonb('output_config').$type<ResponseOutputConfig>().notNull().default({ mode: 'text' }),
    description: text('description'),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('agent_versions_agent_version_idx').on(table.agentId, table.version),
    index('agent_versions_agent_id_idx').on(table.agentId),
    index('agent_versions_org_id_idx').on(table.orgId),
  ],
);
