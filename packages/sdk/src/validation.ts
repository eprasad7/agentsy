import { z } from 'zod';

// ── Slug ────────────────────────────────────────────────────────────

export const agentSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    'Slug must be lowercase alphanumeric + hyphens, starting and ending with alphanumeric',
  );

// ── Tool Name ───────────────────────────────────────────────────────

export const toolNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*$/, 'Tool name must be snake_case');

// ── Model ───────────────────────────────────────────────────────────

const modelSpecSchema = z.object({
  class: z.enum(['fast', 'balanced', 'powerful']),
  provider: z.enum(['anthropic', 'openai']).optional(),
});

export const modelIdentifierSchema = z.union([
  z.string().min(1).max(100),
  modelSpecSchema,
]);

// ── Approval Policy ─────────────────────────────────────────────────

const approvalPolicySchema = z.object({
  autoApprove: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  requireApprovalIn: z.array(z.enum(['development', 'staging', 'production'])).optional(),
}).optional();

// ── Native Tool Definition ──────────────────────────────────────────

export const nativeToolDefinitionSchema = z.object({
  type: z.literal('native'),
  name: toolNameSchema,
  description: z.string().min(1).max(1000),
  input: z.custom<z.ZodType>(
    (val) => val != null && typeof val === 'object' && '_zod' in (val as Record<string, unknown>),
    { message: 'Input must be a Zod schema' },
  ),
  output: z.custom<z.ZodType>().optional(),
  execute: z.function(),
  timeout: z.number().int().min(1_000).max(600_000).optional(),
  riskLevel: z.enum(['read', 'write', 'admin']).optional(),
  approvalPolicy: approvalPolicySchema,
});

// ── MCP Tool Definition ─────────────────────────────────────────────

export const mcpToolDefinitionSchema = z.object({
  type: z.literal('mcp'),
  name: z.string().min(1).max(100),
  serverUrl: z.string().min(1),
  transport: z.enum(['stdio', 'streamable-http']),
  description: z.string().max(1000).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  timeout: z.number().int().min(1_000).max(600_000).optional(),
  riskLevel: z.enum(['read', 'write', 'admin']).optional(),
});

// ── Tool Definition (union) ─────────────────────────────────────────

export const toolDefinitionSchema = z.discriminatedUnion('type', [
  nativeToolDefinitionSchema,
  mcpToolDefinitionSchema,
]);

// ── Output Validation ───────────────────────────────────────────────

const outputValidationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('no_pii'),
    config: z.object({
      categories: z.array(z.enum(['email', 'phone', 'ssn', 'credit_card', 'address', 'name'])).optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal('on_topic'),
    config: z.object({
      topics: z.array(z.string().min(1)),
      classifierModel: modelIdentifierSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal('content_policy'),
    config: z.object({
      blockedCategories: z.array(z.string()).optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal('json_schema'),
    config: z.object({ schema: z.record(z.string(), z.unknown()) }),
  }),
  z.object({
    type: z.literal('custom'),
    config: z.object({
      name: z.string().min(1),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
]);

// ── Guardrails ──────────────────────────────────────────────────────

export const guardrailsConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(100).optional(),
  maxTokens: z.number().int().min(1_000).max(1_000_000).optional(),
  maxCostUsd: z.number().min(0.01).max(1_000).optional(),
  timeoutMs: z.number().int().min(5_000).max(3_600_000).optional(),
  maxToolResultSize: z.number().int().min(1_024).max(1_048_576).optional(),
  toolTimeout: z.number().int().min(1_000).max(600_000).optional(),
  outputValidation: z.array(outputValidationSchema).optional(),
}).optional();

// ── Memory ──────────────────────────────────────────────────────────

const sessionHistorySchema = z.object({
  maxMessages: z.number().int().min(1).max(1000).optional(),
  overflow: z.enum(['truncate', 'summarize']).optional(),
}).optional();

export const memoryConfigSchema = z.object({
  sessionHistory: sessionHistorySchema,
  knowledgeBases: z.array(z.string().min(1)).optional(),
  retrievalTopK: z.number().int().min(1).max(100).optional(),
  retrievalMinScore: z.number().min(0).max(1).optional(),
}).optional();

// ── Model Params ────────────────────────────────────────────────────

export const modelParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).optional(),
  stopSequences: z.array(z.string()).optional(),
}).optional();

// ── Response Output Config ──────────────────────────────────────────

export const responseOutputConfigSchema = z.object({
  mode: z.enum(['text', 'json']),
  json_schema: z.record(z.string(), z.unknown()).optional(),
  strict: z.boolean().optional(),
  schema_version: z.string().optional(),
}).optional().refine(
  (val) => {
    if (!val) return true;
    // json_schema only valid when mode === 'json'
    if (val.json_schema && val.mode !== 'json') return false;
    return true;
  },
  { message: 'json_schema can only be set when mode is "json"' },
);

// ── Agent Config ────────────────────────────────────────────────────

export const agentConfigSchema = z.object({
  slug: agentSlugSchema,
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  model: modelIdentifierSchema,
  fallbackModel: modelIdentifierSchema.optional(),
  systemPrompt: z.union([z.string().min(1), z.function()]),
  tools: z.array(toolDefinitionSchema).optional(),
  guardrails: guardrailsConfigSchema,
  memory: memoryConfigSchema,
  modelParams: modelParamsSchema,
  output: responseOutputConfigSchema,
  codeExecution: z.object({
    enabled: z.boolean(),
    defaultLanguage: z.enum(['python', 'javascript', 'typescript']).optional(),
    template: z.string().optional(),
    limits: z.object({
      timeoutMs: z.number().int().min(1_000).max(300_000).optional(),
      memoryMb: z.number().int().min(64).max(4_096).optional(),
      maxExecutionsPerRun: z.number().int().min(1).max(100).optional(),
    }).optional(),
    network: z.object({
      enabled: z.boolean().optional(),
      allowedDomains: z.array(z.string()).optional(),
    }).optional(),
    persistFilesystem: z.boolean().optional(),
    packages: z.object({
      python: z.array(z.string()).optional(),
      javascript: z.array(z.string()).optional(),
    }).optional(),
    approvalPolicy: approvalPolicySchema,
  }).optional(),
});

// ── Project Config ──────────────────────────────────────────────────

export const projectConfigSchema = z.object({
  agents: z.array(agentConfigSchema).min(1),
  defaults: z.object({
    model: modelIdentifierSchema.optional(),
    fallbackModel: modelIdentifierSchema.optional(),
    guardrails: guardrailsConfigSchema,
    memory: memoryConfigSchema,
    modelParams: modelParamsSchema,
  }).optional(),
});
