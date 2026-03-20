import type { z } from 'zod';

// Re-export shared types that are part of the SDK's public API
export type { RunInput, RunOutput, ModelParams } from '@agentsy/shared';

// ── Model Types ─────────────────────────────────────────────────────

export interface ModelSpec {
  class: 'fast' | 'balanced' | 'powerful';
  provider?: 'anthropic' | 'openai';
}

export type ModelIdentifier = string | ModelSpec;

// ── System Prompt ───────────────────────────────────────────────────

export interface SystemPromptContext {
  sessionMetadata?: Record<string, unknown>;
  currentDate: string;
  agentName: string;
  environment: 'development' | 'staging' | 'production';
}

export type SystemPromptFn = (context: SystemPromptContext) => string | Promise<string>;

// ── Tool Context ────────────────────────────────────────────────────

export interface ToolContext {
  getSecret(name: string): Promise<string>;
  runId: string;
  agentId: string;
  orgId: string;
  sessionId?: string;
  environment: 'development' | 'staging' | 'production';
  fetch: (input: string, init?: Record<string, unknown>) => Promise<unknown>;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
}

// ── Tool Definitions ────────────────────────────────────────────────

export interface NativeToolDefinition<TInput = unknown, TOutput = unknown> {
  type: 'native';
  name: string;
  description: string;
  input: z.ZodType<TInput>;
  output?: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => TOutput | Promise<TOutput>;
  timeout?: number;
  riskLevel?: 'read' | 'write' | 'admin';
  approvalPolicy?: {
    autoApprove?: boolean;
    requireApproval?: boolean;
    requireApprovalIn?: Array<'development' | 'staging' | 'production'>;
  };
}

export interface McpToolDefinition {
  type: 'mcp';
  name: string;
  serverUrl: string;
  transport: 'stdio' | 'streamable-http';
  description?: string;
  headers?: Record<string, string>;
  timeout?: number;
  riskLevel?: 'read' | 'write' | 'admin';
}

export type ToolDefinition = NativeToolDefinition<unknown, unknown> | McpToolDefinition;

// ── Output Validation ───────────────────────────────────────────────

export interface NoPiiConfig {
  categories?: ('email' | 'phone' | 'ssn' | 'credit_card' | 'address' | 'name')[];
}

export interface OnTopicConfig {
  topics: string[];
  classifierModel?: ModelIdentifier;
}

export interface ContentPolicyConfig {
  blockedCategories?: string[];
}

export interface JsonSchemaValidationConfig {
  schema: Record<string, unknown>;
}

export interface CustomValidationConfig {
  name: string;
  config?: Record<string, unknown>;
}

export type OutputValidation =
  | { type: 'no_pii'; config?: NoPiiConfig }
  | { type: 'on_topic'; config: OnTopicConfig }
  | { type: 'content_policy'; config?: ContentPolicyConfig }
  | { type: 'json_schema'; config: JsonSchemaValidationConfig }
  | { type: 'custom'; config: CustomValidationConfig };

// ── Guardrails ──────────────────────────────────────────────────────

export interface GuardrailsConfig {
  maxIterations?: number;
  maxTokens?: number;
  maxCostUsd?: number;
  timeoutMs?: number;
  maxToolResultSize?: number;
  toolTimeout?: number;
  outputValidation?: OutputValidation[];
}

// ── Memory ──────────────────────────────────────────────────────────

export interface SessionHistoryConfig {
  maxMessages?: number;
  overflow?: 'truncate' | 'summarize';
}

export interface MemoryConfig {
  sessionHistory?: SessionHistoryConfig;
  knowledgeBases?: string[];
  retrievalTopK?: number;
  retrievalMinScore?: number;
}

// ── Code Execution (post-beta, type-only) ───────────────────────────

export interface CodeExecutionConfig {
  enabled: boolean;
  defaultLanguage?: 'python' | 'javascript' | 'typescript';
  template?: string;
  limits?: {
    timeoutMs?: number;
    memoryMb?: number;
    maxExecutionsPerRun?: number;
  };
  network?: {
    enabled?: boolean;
    allowedDomains?: string[];
  };
  persistFilesystem?: boolean;
  packages?: {
    python?: string[];
    javascript?: string[];
  };
  approvalPolicy?: {
    autoApprove?: boolean;
    requireApproval?: boolean;
    requireApprovalIn?: Array<'development' | 'staging' | 'production'>;
  };
}

// ── Evolution (post-beta, type-only) ────────────────────────────────

export interface EvolutionDefinition {
  metric: {
    dataset: string;
    graders: string[];
    weights: Record<string, number>;
  };
  mutable: string[];
  frozen: string[];
  directives?: string;
  budget?: {
    maxMutations?: number;
    maxCostUsd?: number;
    maxDurationMinutes?: number;
    maxCostPerMutation?: number;
  };
  schedule?: string;
  safety?: {
    maxRegressionPerGrader?: number;
    zeroToleranceGraders?: string[];
  };
  autoPromote?: 'none' | 'staging' | 'production';
  simplicityPressure?: boolean;
}

// ── Agent Config ────────────────────────────────────────────────────

export interface AgentConfig {
  slug: string;
  name?: string;
  description?: string;
  model: ModelIdentifier;
  fallbackModel?: ModelIdentifier;
  systemPrompt: string | SystemPromptFn;
  tools?: ToolDefinition[];
  guardrails?: GuardrailsConfig;
  memory?: MemoryConfig;
  modelParams?: import('@agentsy/shared').ModelParams;
  codeExecution?: CodeExecutionConfig;
}

// ── Project Config ──────────────────────────────────────────────────

export interface ProjectConfig {
  agents: AgentConfig[];
  defaults?: {
    model?: ModelIdentifier;
    fallbackModel?: ModelIdentifier;
    guardrails?: GuardrailsConfig;
    memory?: MemoryConfig;
    modelParams?: import('@agentsy/shared').ModelParams;
  };
}
