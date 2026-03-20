import type { RunInput, RunOutput, ModelIdentifier } from '@agentsy/shared';

// ── Dataset Types ───────────────────────────────────────────────────

export interface MemoryExpectation {
  type: 'session_write' | 'knowledge_update';
  key?: string;
  valueContains?: string;
}

export interface DatasetCase {
  input: string | RunInput;
  expected_output?: string | RunOutput;
  expected_tool_calls?: ExpectedToolCall[];
  expected_trajectory?: TrajectoryStep[];
  expected_approval_behavior?: ApprovalExpectation;
  expected_citations?: string[];
  expected_memory_writes?: MemoryExpectation[];
  mocked_tool_results?: MockedToolResult[];
  session_history?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface DatasetDefinition {
  name: string;
  description?: string;
  cases: DatasetCase[];
}

export interface ExpectedToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  order?: number;
}

export interface MockedToolResult {
  toolName: string;
  argumentsMatch?: Record<string, unknown>;
  result: unknown;
}

export interface TrajectoryStep {
  type: 'tool_call' | 'response' | 'approval_request';
  toolName?: string;
  contains?: string;
}

export interface ApprovalExpectation {
  shouldRequest: boolean;
  toolName?: string;
  action?: 'approve' | 'deny';
}

// ── Grader Types ────────────────────────────────────────────────────

export type GraderType =
  | 'exact_match'
  | 'json_schema'
  | 'regex'
  | 'numeric_threshold'
  | 'embedding_similarity'
  | 'tool_name_match'
  | 'tool_args_match'
  | 'llm_judge'
  | 'tool_sequence'
  | 'unnecessary_steps';

export interface ScoreResult {
  score: number;
  name: string;
  graderType: GraderType;
  reasoning?: string;
  metadata?: Record<string, unknown>;
}

export interface GraderContext {
  input: string | RunInput;
  output: string;
  expectedOutput?: string | RunOutput;
  expectedToolCalls?: ExpectedToolCall[];
  expectedTrajectory?: TrajectoryStep[];
  actualToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
  actualSteps?: Array<{ type: string; toolName?: string; output?: string }>;
}

export type GraderFn = (context: GraderContext) => Promise<ScoreResult> | ScoreResult;

export interface GraderDefinition {
  name: string;
  type: GraderType;
  config?: Record<string, unknown>;
  grade: GraderFn;
}

// ── Experiment Types ────────────────────────────────────────────────

export type ToolMode = 'mock' | 'dry-run' | 'live';

export interface ExperimentDefinition {
  name?: string;
  agent: AgentRef;
  dataset: DatasetDefinition | string;
  graders: GraderDefinition[];
  toolMode?: ToolMode;
  parallelism?: number;
  judgeModel?: ModelIdentifier;
}

export interface AgentRef {
  slug?: string;
  id?: string;
  version?: number;
  config?: unknown;
}

export interface CaseResult {
  caseIndex: number;
  input: string | RunInput;
  output: string;
  scores: Record<string, ScoreResult>;
  passed: boolean;
  durationMs: number;
  costUsd: number;
  error?: string;
}

export interface ExperimentResult {
  name?: string;
  summaryScores: Record<string, number>;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  totalCostUsd: number;
  totalDurationMs: number;
  caseResults: CaseResult[];
}

// ── Comparison Types ────────────────────────────────────────────────

export interface CaseDiff {
  caseIndex: number;
  scoresA: Record<string, number>;
  scoresB: Record<string, number>;
  deltas: Record<string, number>;
  classification: 'improved' | 'regressed' | 'unchanged';
}

export interface ComparisonResult {
  summaryDeltas: Record<string, number>;
  improved: number;
  regressed: number;
  unchanged: number;
  caseDiffs: CaseDiff[];
}
