import {
  createPgClient,
  evalDatasetCases,
  evalExperiments,
  evalExperimentResults,
  evalBaselines,
  eq,
  and,
} from '@agentsy/db';
import type { RunInput, RunOutput } from '@agentsy/shared';
import { newId } from '@agentsy/shared';

// ── DB Connection ───────────────────────────────────────────────────

let db: ReturnType<typeof createPgClient> | undefined;

function getDb() {
  if (db) return db;
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  db = createPgClient(url);
  return db;
}

// ── Activity: Load Dataset Cases ────────────────────────────────────

export interface LoadDatasetCasesInput {
  datasetId: string;
  orgId: string;
}

export interface EvalCaseData {
  id: string;
  input: RunInput;
  expectedOutput: RunOutput | null;
  expectedToolCalls: Array<{ name: string; arguments?: Record<string, unknown>; order?: number }>;
  expectedTrajectory: Array<{ type: string; toolName?: string; contains?: string }>;
  mockedToolResults: Array<{ toolName: string; argumentsMatch?: Record<string, unknown>; result: unknown }>;
  sessionHistory: Array<{ role: string; content: string }>;
}

export async function loadDatasetCases(input: LoadDatasetCasesInput): Promise<EvalCaseData[]> {
  const database = getDb();
  const rows = await database
    .select()
    .from(evalDatasetCases)
    .where(
      and(eq(evalDatasetCases.datasetId, input.datasetId), eq(evalDatasetCases.orgId, input.orgId)),
    )
    .orderBy(evalDatasetCases.caseOrder);

  return rows.map((r) => ({
    id: r.id,
    input: r.input,
    expectedOutput: r.expectedOutput,
    expectedToolCalls: r.expectedToolCalls ?? [],
    expectedTrajectory: r.expectedTrajectory ?? [],
    mockedToolResults: r.mockedToolResults ?? [],
    sessionHistory: r.sessionHistory ?? [],
  }));
}

// ── Activity: Run Agent for Eval Case ───────────────────────────────

export interface RunAgentForEvalCaseInput {
  agentId: string;
  versionId: string;
  orgId: string;
  caseInput: RunInput;
  sessionHistory?: Array<{ role: string; content: string }>;
  mockedToolResults?: Array<{ toolName: string; argumentsMatch?: Record<string, unknown>; result: unknown }>;
  toolMode: 'mock' | 'dry-run' | 'live';
}

export interface RunAgentForEvalCaseOutput {
  runId?: string;
  output: string;
  toolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>;
  steps: Array<{ type: string; toolName?: string; output?: string }>;
  costUsd: number;
}

export async function runAgentForEvalCase(
  input: RunAgentForEvalCaseInput,
): Promise<RunAgentForEvalCaseOutput> {
  // In a full implementation, this would start a child AgentRunWorkflow
  // with tool mocking. For now, we use a simplified in-process approach.
  // The real integration happens when the eval workflow calls the agent run workflow
  // via Temporal child workflow.

  // Placeholder: return mock output for now
  // TODO(Phase 4.7): Integrate with actual AgentRunWorkflow via child workflow
  const inputText = resolveInputText(input.caseInput);

  return {
    output: `[eval-mock] Response to: ${inputText.slice(0, 100)}`,
    toolCalls: [],
    steps: [],
    costUsd: 0,
  };
}

// ── Activity: Grade Eval Case ───────────────────────────────────────

export interface GradeEvalCaseInput {
  input: RunInput;
  output: string;
  expectedOutput?: RunOutput | null;
  expectedToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
  expectedTrajectory?: Array<{ type: string; toolName?: string; contains?: string }>;
  actualToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
  actualSteps?: Array<{ type: string; toolName?: string; output?: string }>;
  graders: Array<{ name: string; type: string; config?: Record<string, unknown> }>;
  judgeModel?: string;
}

export interface GradeEvalCaseOutput {
  scores: Record<string, { score: number; name: string; graderType: string; reasoning?: string }>;
  passed: boolean;
}

export async function gradeEvalCase(input: GradeEvalCaseInput): Promise<GradeEvalCaseOutput> {
  // Dynamic import to use the eval package graders
  const {
    exactMatch,
    jsonSchemaGrader,
    regex,
    numericThreshold,
    embeddingSimilarity,
    toolNameMatch,
    toolArgsMatch,
    llmJudge,
    toolSequence,
    unnecessarySteps,
  } = await import('@agentsy/eval');

  const scores: Record<string, { score: number; name: string; graderType: string; reasoning?: string }> = {};

  const context = {
    input: input.input as string | RunInput,
    output: input.output,
    expectedOutput: input.expectedOutput ?? undefined,
    expectedToolCalls: input.expectedToolCalls,
    expectedTrajectory: input.expectedTrajectory as Array<{ type: 'tool_call' | 'response' | 'approval_request'; toolName?: string; contains?: string }> | undefined,
    actualToolCalls: input.actualToolCalls,
    actualSteps: input.actualSteps,
  };

  for (const graderConfig of input.graders) {
    const c = graderConfig.config ?? {};
    let grader: Awaited<ReturnType<typeof exactMatch>> | null = null;

    switch (graderConfig.type) {
      case 'exact_match':
        grader = exactMatch(c as Parameters<typeof exactMatch>[0]);
        break;
      case 'json_schema':
        grader = jsonSchemaGrader((c['schema'] ?? c) as Record<string, unknown>);
        break;
      case 'regex':
        grader = regex((c['pattern'] as string) ?? '');
        break;
      case 'numeric_threshold':
        grader = numericThreshold(c as unknown as Parameters<typeof numericThreshold>[0]);
        break;
      case 'embedding_similarity':
        grader = embeddingSimilarity(c as Parameters<typeof embeddingSimilarity>[0]);
        break;
      case 'tool_name_match':
        grader = toolNameMatch(c as Parameters<typeof toolNameMatch>[0]);
        break;
      case 'tool_args_match':
        grader = toolArgsMatch();
        break;
      case 'llm_judge':
        grader = llmJudge({
          rubric: (c['rubric'] as string) ?? '',
          model: input.judgeModel ?? (c['model'] as string),
          ...c,
        } as unknown as Parameters<typeof llmJudge>[0]);
        break;
      case 'tool_sequence':
        grader = toolSequence(c as Parameters<typeof toolSequence>[0]);
        break;
      case 'unnecessary_steps':
        grader = unnecessarySteps();
        break;
    }

    if (grader) {
      const result = await grader.grade(context);
      scores[graderConfig.name] = result;
    }
  }

  // Case passes if average score >= 0.5
  const scoreValues = Object.values(scores).map((s) => s.score);
  const avgScore = scoreValues.length > 0
    ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
    : 0;

  return { scores, passed: avgScore >= 0.5 };
}

// ── Activity: Persist Eval Result ───────────────────────────────────

export interface PersistEvalResultInput {
  experimentId: string;
  caseId: string;
  orgId: string;
  runId?: string;
  output: string;
  scores: Record<string, { score: number; name: string; graderType: string; reasoning?: string }>;
  passed: boolean;
  durationMs: number;
  costUsd: number;
  error?: string;
}

export async function persistEvalResult(input: PersistEvalResultInput): Promise<void> {
  const database = getDb();
  const id = newId('exr');

  await database.insert(evalExperimentResults).values({
    id,
    experimentId: input.experimentId,
    caseId: input.caseId,
    orgId: input.orgId,
    runId: input.runId ?? null,
    output: input.output,
    scores: input.scores,
    passed: input.passed,
    durationMs: input.durationMs,
    costUsd: input.costUsd,
    error: input.error ?? null,
    createdAt: new Date(),
  });
}

// ── Activity: Update Experiment Status ──────────────────────────────

export interface UpdateExperimentStatusInput {
  experimentId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  summaryScores?: Record<string, number>;
  passedCases?: number;
  failedCases?: number;
  totalCostUsd?: number;
  totalDurationMs?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export async function updateExperimentStatus(input: UpdateExperimentStatusInput): Promise<void> {
  const database = getDb();
  const updates: Record<string, unknown> = {
    status: input.status,
    updatedAt: new Date(),
  };

  if (input.summaryScores) updates['summaryScores'] = input.summaryScores;
  if (input.passedCases !== undefined) updates['passedCases'] = input.passedCases;
  if (input.failedCases !== undefined) updates['failedCases'] = input.failedCases;
  if (input.totalCostUsd !== undefined) updates['totalCostUsd'] = input.totalCostUsd;
  if (input.totalDurationMs !== undefined) updates['totalDurationMs'] = input.totalDurationMs;
  if (input.error) updates['error'] = input.error;
  if (input.startedAt) updates['startedAt'] = new Date(input.startedAt);
  if (input.completedAt) updates['completedAt'] = new Date(input.completedAt);

  await database
    .update(evalExperiments)
    .set(updates)
    .where(eq(evalExperiments.id, input.experimentId));
}

// ── Activity: Auto-compare with Baseline ────────────────────────────

export interface AutoCompareInput {
  experimentId: string;
  agentId: string;
  datasetId: string;
  orgId: string;
}

export async function autoCompareWithBaseline(input: AutoCompareInput): Promise<void> {
  const database = getDb();

  // Find active baseline
  const baseline = await database
    .select()
    .from(evalBaselines)
    .where(
      and(
        eq(evalBaselines.agentId, input.agentId),
        eq(evalBaselines.datasetId, input.datasetId),
        eq(evalBaselines.orgId, input.orgId),
        eq(evalBaselines.isActive, true),
      ),
    )
    .limit(1);

  if (!baseline[0]) return; // No baseline — nothing to compare

  // Load experiment results
  const experiment = await database
    .select()
    .from(evalExperiments)
    .where(eq(evalExperiments.id, input.experimentId))
    .limit(1);

  if (!experiment[0] || experiment[0].status !== 'completed') return;

  // Compute regression count
  const results = await database
    .select()
    .from(evalExperimentResults)
    .where(eq(evalExperimentResults.experimentId, input.experimentId));

  const baselinePerCase = baseline[0].perCaseScores ?? {};
  let regressions = 0;

  for (const result of results) {
    const baselineScores = baselinePerCase[result.caseId];
    if (!baselineScores || !result.scores) continue;

    for (const [graderName, scoreData] of Object.entries(result.scores)) {
      const baselineScore = baselineScores[graderName];
      if (baselineScore !== undefined && scoreData.score < baselineScore - 0.05) {
        regressions++;
        break; // Count one regression per case
      }
    }
  }

  // Store regression count in experiment metadata
  if (regressions > 0) {
    const currentConfig = experiment[0].config ?? {};
    await database
      .update(evalExperiments)
      .set({
        config: { ...currentConfig, _regressionCount: regressions } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(evalExperiments.id, input.experimentId));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function resolveInputText(input: RunInput): string {
  if (typeof input === 'object' && 'text' in input) return input.text;
  if (typeof input === 'object' && 'messages' in input) {
    return input.messages.map((m) => m.content).join('\n');
  }
  if (typeof input === 'object' && 'data' in input) {
    return JSON.stringify(input.data);
  }
  return String(input);
}
