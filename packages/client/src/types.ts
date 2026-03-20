import type { RunInput, RunOutput, RunStreamEvent } from '@agentsy/shared';

export interface AgentsyClientConfig {
  apiKey: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}

export interface RunRequest {
  input: string | RunInput;
  session_id?: string;
  version_id?: string;
  environment?: 'development' | 'staging' | 'production';
  metadata?: Record<string, unknown>;
}

export interface RunResponse {
  id: string;
  agent_id: string;
  version_id: string | null;
  session_id: string | null;
  status: string;
  input: RunInput;
  output: RunOutput | null;
  error: string | null;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number | null;
  model: string | null;
  trace_id: string | null;
  output_valid: boolean | null;
  output_validation: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RunAccepted {
  id: string;
  agent_id: string;
  status: 'queued';
  poll_url: string;
  created_at: string;
}

export interface RunStep {
  id: string;
  run_id: string;
  step_order: number;
  type: string;
  model: string | null;
  tool_name: string | null;
  input: string | null;
  output: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number | null;
  error: string | null;
  parsed_output: unknown;
  output_validation: Record<string, unknown> | null;
  created_at: string;
}

export interface Session {
  id: string;
  org_id: string;
  agent_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  run_id: string | null;
  role: string;
  content: string;
  message_order: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export type { RunStreamEvent };
