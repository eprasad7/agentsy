import type { RunOutput } from './types.js';

// ── SSE Event Types (13 total) ──────────────────────────────────────

export interface RunStartedEvent {
  type: 'run.started';
  run_id: string;
  agent_id: string;
  version_id: string;
  session_id: string | null;
  model: string;
}

export interface StepThinkingEvent {
  type: 'step.thinking';
  step_id: string;
  step_order: number;
  model: string;
}

export interface StepTextDeltaEvent {
  type: 'step.text_delta';
  step_id: string;
  delta: string;
}

export interface StepToolCallEvent {
  type: 'step.tool_call';
  step_id: string;
  step_order: number;
  tool_name: string;
  tool_call_id: string;
  arguments: Record<string, unknown>;
}

export interface StepToolResultEvent {
  type: 'step.tool_result';
  step_id: string;
  tool_name: string;
  tool_call_id: string;
  result: unknown;
  duration_ms: number;
  error: string | null;
}

export interface StepApprovalRequestedEvent {
  type: 'step.approval_requested';
  step_id: string;
  step_order: number;
  tool_name: string;
  tool_call_id: string;
  arguments: Record<string, unknown>;
  risk_level: 'write' | 'admin';
}

export interface StepApprovalResolvedEvent {
  type: 'step.approval_resolved';
  step_id: string;
  tool_name: string;
  tool_call_id: string;
  approved: boolean;
  resolved_by: string | null;
  reason?: string;
}

export interface StepCompletedEvent {
  type: 'step.completed';
  step_id: string;
  step_order: number;
  step_type: 'llm_call' | 'tool_call' | 'retrieval' | 'guardrail' | 'approval_request';
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number;
}

export interface StepGuardrailEvent {
  type: 'step.guardrail';
  step_id: string;
  step_order: number;
  guardrail_type: string;
  passed: boolean;
  message: string | null;
}

export interface StepRetrievalEvent {
  type: 'step.retrieval';
  step_id: string;
  step_order: number;
  knowledge_base_id: string;
  query: string;
  results_count: number;
  duration_ms: number;
}

export interface RunCompletedEvent {
  type: 'run.completed';
  run_id: string;
  output: RunOutput;
  output_valid?: boolean | null;
  output_validation?: { ok: boolean; errors?: Array<{ path: string; message: string }> } | null;
  parsed_output?: unknown;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
  trace_id: string | null;
}

export interface RunFailedEvent {
  type: 'run.failed';
  run_id: string;
  error: string;
  error_type: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
  failed_step_id: string | null;
}

export interface RunCancelledEvent {
  type: 'run.cancelled';
  run_id: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
}

export type RunStreamEvent =
  | RunStartedEvent
  | StepThinkingEvent
  | StepTextDeltaEvent
  | StepToolCallEvent
  | StepToolResultEvent
  | StepApprovalRequestedEvent
  | StepApprovalResolvedEvent
  | StepCompletedEvent
  | StepGuardrailEvent
  | StepRetrievalEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent;

/**
 * Redis channel for a run's events.
 */
export function runEventChannel(runId: string): string {
  return `run:${runId}:events`;
}

/**
 * Redis key for persisted event log (for Last-Event-ID replay).
 */
export function runEventLogKey(runId: string): string {
  return `run:${runId}:event_log`;
}

/**
 * Wire format for events published to Redis.
 */
export interface RedisRunEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
}
