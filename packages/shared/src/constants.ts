// ── Guardrail Defaults ───────────────────────────────────────────────

export const GUARDRAIL_DEFAULTS = {
  maxIterations: 10,
  maxTokens: 50_000,
  timeoutMs: 300_000,
  maxToolResultSize: 10_240,
  toolTimeout: 30_000,
} as const;

// ── Capability Class → Model Mappings ────────────────────────────────

export const CAPABILITY_CLASS_MODELS = {
  fast: {
    anthropic: 'claude-haiku-3.5',
    openai: 'gpt-4o-mini',
  },
  balanced: {
    anthropic: 'claude-sonnet-4',
    openai: 'gpt-4o',
  },
  powerful: {
    anthropic: 'claude-opus-4',
    openai: 'o3',
  },
} as const;

// ── Run Status ───────────────────────────────────────────────────────

export const RUN_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
  'timeout',
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

// ── Environment Types ────────────────────────────────────────────────

export const ENVIRONMENT_TYPES = ['development', 'staging', 'production'] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];

// ── Tool Risk Levels ─────────────────────────────────────────────────

export const TOOL_RISK_LEVELS = ['read', 'write', 'admin'] as const;
export type ToolRiskLevel = (typeof TOOL_RISK_LEVELS)[number];
