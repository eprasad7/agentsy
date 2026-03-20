// SQLite-compatible schema subset for local development
// No RLS, no pgvector, no tsvector, no pgEnum
// Used by `agentsy dev` for local-first development

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ── Organizations ────────────────────────────────────────────────────

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  externalAuthId: text('external_auth_id').notNull(),
  plan: text('plan').notNull().default('free'),
  billingEmail: text('billing_email'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
  deletedAt: text('deleted_at'),
});

// ── Organization Members ─────────────────────────────────────────────

export const organizationMembers = sqliteTable('organization_members', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
});

// ── API Keys ─────────────────────────────────────────────────────────

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  revokedAt: text('revoked_at'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
});

// ── Agents ───────────────────────────────────────────────────────────

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
  deletedAt: text('deleted_at'),
});

// ── Agent Versions ───────────────────────────────────────────────────

export const agentVersions = sqliteTable('agent_versions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  orgId: text('org_id').notNull().references(() => organizations.id),
  version: integer('version').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(),
  modelSpec: text('model_spec', { mode: 'json' }),
  fallbackModel: text('fallback_model'),
  toolsConfig: text('tools_config', { mode: 'json' }).notNull().default('[]'),
  guardrailsConfig: text('guardrails_config', { mode: 'json' }).notNull().default('{}'),
  modelParams: text('model_params', { mode: 'json' }).default('{}'),
  description: text('description'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default('(datetime())'),
});

// ── Environments ─────────────────────────────────────────────────────

export const environments = sqliteTable('environments', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  toolAllowList: text('tool_allow_list', { mode: 'json' }),
  toolDenyList: text('tool_deny_list', { mode: 'json' }),
  requireApprovalForWriteTools: integer('require_approval_for_write_tools', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
});

// ── Sessions ─────────────────────────────────────────────────────────

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
  deletedAt: text('deleted_at'),
});

// ── Runs ─────────────────────────────────────────────────────────────

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  versionId: text('version_id').references(() => agentVersions.id),
  sessionId: text('session_id').references(() => sessions.id),
  parentRunId: text('parent_run_id'),
  environmentId: text('environment_id').notNull().references(() => environments.id),
  status: text('status').notNull().default('queued'),
  input: text('input', { mode: 'json' }).notNull(),
  output: text('output', { mode: 'json' }),
  error: text('error'),
  totalTokensIn: integer('total_tokens_in').notNull().default(0),
  totalTokensOut: integer('total_tokens_out').notNull().default(0),
  totalCostUsd: real('total_cost_usd').notNull().default(0),
  durationMs: integer('duration_ms'),
  model: text('model'),
  temporalWorkflowId: text('temporal_workflow_id'),
  traceId: text('trace_id'),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
});

// ── Run Steps ────────────────────────────────────────────────────────

export const runSteps = sqliteTable('run_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  orgId: text('org_id').notNull().references(() => organizations.id),
  stepOrder: integer('step_order').notNull(),
  type: text('type').notNull(),
  model: text('model'),
  toolName: text('tool_name'),
  input: text('input'),
  output: text('output'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  durationMs: integer('duration_ms'),
  error: text('error'),
  outputTruncated: integer('output_truncated', { mode: 'boolean' }).notNull().default(false),
  approvalStatus: text('approval_status'),
  approvalResolvedBy: text('approval_resolved_by'),
  approvalResolvedAt: text('approval_resolved_at'),
  approvalWaitStartedAt: text('approval_wait_started_at'),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default('(datetime())'),
});

// ── Messages ─────────────────────────────────────────────────────────

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  orgId: text('org_id').notNull().references(() => organizations.id),
  runId: text('run_id').references(() => runs.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolCallId: text('tool_call_id'),
  toolName: text('tool_name'),
  messageOrder: integer('message_order').notNull(),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  createdAt: text('created_at').notNull().default('(datetime())'),
});

// ── Knowledge Bases ──────────────────────────────────────────────────

export const knowledgeBases = sqliteTable('knowledge_bases', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  name: text('name').notNull(),
  description: text('description'),
  embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),
  embeddingDimensions: integer('embedding_dimensions').notNull().default(1536),
  chunkSize: integer('chunk_size').notNull().default(512),
  chunkOverlap: integer('chunk_overlap').notNull().default(64),
  totalChunks: integer('total_chunks').notNull().default(0),
  totalDocuments: integer('total_documents').notNull().default(0),
  totalSizeBytes: integer('total_size_bytes').notNull().default(0),
  createdAt: text('created_at').notNull().default('(datetime())'),
  updatedAt: text('updated_at').notNull().default('(datetime())'),
  deletedAt: text('deleted_at'),
});

// ── Knowledge Chunks (no pgvector/tsvector in SQLite) ────────────────

export const knowledgeChunks = sqliteTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  knowledgeBaseId: text('knowledge_base_id').notNull().references(() => knowledgeBases.id),
  orgId: text('org_id').notNull().references(() => organizations.id),
  documentName: text('document_name').notNull(),
  documentHash: text('document_hash').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  // No embedding or tsv columns in SQLite — vector search stubbed in dev mode
  tokenCount: integer('token_count').notNull().default(0),
  embeddingModel: text('embedding_model'),
  embeddedAt: text('embedded_at'),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  createdAt: text('created_at').notNull().default('(datetime())'),
});
