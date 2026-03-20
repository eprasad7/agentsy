// ── Run I/O Envelopes ────────────────────────────────────────────────

export type RunInput =
  | { type: 'text'; text: string }
  | { type: 'messages'; messages: Array<{ role: string; content: string }> }
  | { type: 'structured'; data: Record<string, unknown> };

export type RunOutput =
  | { type: 'text'; text: string }
  | { type: 'messages'; messages: Array<{ role: string; content: string }> }
  | { type: 'structured'; data: Record<string, unknown> };

// ── API Error ────────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Pagination ───────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

// ── SSE Events ───────────────────────────────────────────────────────

export type SseEvent =
  | { event: 'run.started'; data: { run_id: string } }
  | { event: 'run.step'; data: { run_id: string; step_id: string; type: string } }
  | { event: 'run.token'; data: { run_id: string; token: string } }
  | { event: 'run.approval_required'; data: { run_id: string; step_id: string; tool_name: string } }
  | { event: 'run.completed'; data: { run_id: string; output: RunOutput } }
  | { event: 'run.failed'; data: { run_id: string; error: ApiError } };

// ── Model Types ──────────────────────────────────────────────────────

export interface ModelSpec {
  class: 'fast' | 'balanced' | 'powerful';
  provider?: 'anthropic' | 'openai';
}

export type ModelIdentifier = string | ModelSpec;

// ── Guardrails ───────────────────────────────────────────────────────

export interface GuardrailsConfig {
  maxIterations?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxToolResultSize?: number;
  toolTimeout?: number;
  outputValidation?: OutputValidation[];
}

export type OutputValidation =
  | { type: 'no_pii'; config?: { categories?: string[] } }
  | { type: 'on_topic'; config: { topics: string[]; classifierModel?: ModelIdentifier } }
  | { type: 'content_policy'; config?: { blockedCategories?: string[] } }
  | { type: 'json_schema'; config: { schema: Record<string, unknown> } }
  | { type: 'custom'; config: { name: string; prompt: string } };

// ── Response Output Contract ─────────────────────────────────────────

export interface ResponseOutputConfig {
  mode: 'text' | 'json';
  json_schema?: Record<string, unknown>;
  strict?: boolean;
  schema_version?: string;
}

export interface OutputValidationResult {
  ok: boolean;
  errors?: Array<{ path: string; message: string }>;
}

// ── JSONB Column Types ───────────────────────────────────────────────

export interface ToolsConfig {
  native: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    riskLevel: 'read' | 'write' | 'admin';
    timeout?: number;
  }>;
  mcp: Array<{
    name: string;
    serverUrl: string;
    transport: 'stdio' | 'streamable-http';
    tools?: string[];
    env?: Record<string, string>;
  }>;
}

export interface ModelParams {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export interface StepMetadata {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  approvalStatus?: 'pending' | 'approved' | 'denied';
  error?: string;
}

export interface ExperimentConfig {
  agentVersionId: string;
  datasetId: string;
  evalMode: 'mock' | 'dry-run' | 'live';
  model?: string;
  guardrails?: GuardrailsConfig;
}

export interface ScoreResult {
  score: number;
  label?: string;
  reasoning?: string;
  graderModel?: string;
}
