import { CAPABILITY_CLASS_MODELS } from '@agentsy/shared';
import { z } from 'zod';

import type { AgentConfig, ModelIdentifier } from './types.js';

/**
 * Convert a Zod schema to JSON Schema (for LLM tool definitions).
 * Uses zod v4's built-in toJSONSchema.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

/**
 * Resolve a ModelIdentifier to a concrete model string.
 */
export function resolveModelString(model: ModelIdentifier): string {
  if (typeof model === 'string') return model;

  const provider = model.provider ?? 'anthropic';
  const classModels = CAPABILITY_CLASS_MODELS[model.class];
  if (!classModels) throw new Error(`Unknown capability class: ${model.class}`);

  const resolved = classModels[provider];
  if (!resolved) throw new Error(`No model for provider "${provider}" in class "${model.class}"`);
  return resolved;
}

/**
 * Serialize an AgentConfig for API storage (agent_versions table).
 * Converts functions and Zod schemas to JSON-serializable data.
 */
export function serializeAgentConfig(config: Readonly<AgentConfig>): {
  systemPrompt: string;
  model: string;
  modelSpec: string | { class: string; provider?: string };
  fallbackModel: string | null;
  toolsConfig: SerializedToolConfig[];
  guardrailsConfig: SerializedGuardrailsConfig;
  modelParams: SerializedModelParams;
} {
  const systemPrompt = typeof config.systemPrompt === 'string'
    ? config.systemPrompt
    : '[dynamic — must be evaluated at runtime]';

  const model = resolveModelString(config.model);
  const modelSpec = typeof config.model === 'string'
    ? config.model
    : { class: config.model.class, provider: config.model.provider };

  const fallbackModel = config.fallbackModel
    ? resolveModelString(config.fallbackModel)
    : null;

  const toolsConfig: SerializedToolConfig[] = (config.tools ?? []).map((tool) => {
    if (tool.type === 'native') {
      return {
        name: tool.name,
        type: 'native' as const,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.input),
        timeout: tool.timeout,
        riskLevel: tool.riskLevel ?? 'read',
        approvalPolicy: tool.approvalPolicy,
      };
    }
    return {
      name: tool.name,
      type: 'mcp' as const,
      description: tool.description,
      mcpServerUrl: tool.serverUrl,
      mcpTransport: tool.transport,
      headers: tool.headers,
      timeout: tool.timeout,
      riskLevel: tool.riskLevel ?? 'read',
    };
  });

  const g = config.guardrails ?? {};
  const guardrailsConfig: SerializedGuardrailsConfig = {
    maxIterations: g.maxIterations,
    maxTokens: g.maxTokens,
    maxCostUsd: g.maxCostUsd,
    timeoutMs: g.timeoutMs,
    maxToolResultSize: g.maxToolResultSize,
    toolTimeout: g.toolTimeout,
    outputValidation: g.outputValidation?.map((v) => ({
      type: v.type,
      config: 'config' in v ? v.config : undefined,
    })),
  };

  const modelParams: SerializedModelParams = config.modelParams ?? {};

  return { systemPrompt, model, modelSpec, fallbackModel, toolsConfig, guardrailsConfig, modelParams };
}

// ── Serialized types (JSON-safe, no functions/Zod) ──────────────────

export interface SerializedToolConfig {
  name: string;
  type: 'native' | 'mcp';
  description?: string;
  inputSchema?: Record<string, unknown>;
  mcpServerUrl?: string;
  mcpTransport?: 'stdio' | 'streamable-http';
  headers?: Record<string, string>;
  timeout?: number;
  riskLevel: 'read' | 'write' | 'admin';
  approvalPolicy?: {
    autoApprove?: boolean;
    requireApproval?: boolean;
    requireApprovalIn?: Array<'development' | 'staging' | 'production'>;
  };
}

export interface SerializedGuardrailsConfig {
  maxIterations?: number;
  maxTokens?: number;
  maxCostUsd?: number;
  timeoutMs?: number;
  maxToolResultSize?: number;
  toolTimeout?: number;
  outputValidation?: Array<{
    type: string;
    config?: unknown;
  }>;
}

export interface SerializedModelParams {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}
