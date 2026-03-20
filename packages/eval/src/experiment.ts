import type {
  ExperimentDefinition,
  ExperimentResult,
  CaseResult,
  DatasetCase,
  GraderContext,
  ScoreResult,
} from './types.js';

/**
 * Define an experiment. Validates and returns a frozen definition.
 */
export function defineExperiment(def: ExperimentDefinition): Readonly<ExperimentDefinition> {
  if (!def.graders || def.graders.length === 0) {
    throw new Error('Experiment must have at least one grader');
  }
  if (!def.dataset) {
    throw new Error('Experiment must reference a dataset');
  }
  if (!def.agent) {
    throw new Error('Experiment must reference an agent');
  }

  return Object.freeze(def);
}

/**
 * Case runner function type — executes a single agent run and returns results.
 */
export type CaseRunnerFn = (
  caseData: DatasetCase,
  index: number,
) => Promise<{
  output: string;
  toolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>;
  steps: Array<{ type: string; toolName?: string; output?: string }>;
  durationMs: number;
  costUsd: number;
}>;

/**
 * Default local case runner — when toolMode is "mock" and expected_output exists,
 * returns the expected output directly (pure eval, no LLM call needed).
 * Otherwise returns a placeholder.
 */
function defaultLocalRunner(toolMode: string): CaseRunnerFn {
  return async (caseData) => {
    const startTime = Date.now();

    if (toolMode === 'mock' && caseData.expected_output) {
      const output =
        typeof caseData.expected_output === 'string'
          ? caseData.expected_output
          : 'text' in caseData.expected_output
            ? caseData.expected_output.text
            : JSON.stringify(caseData.expected_output);

      return {
        output,
        toolCalls: (caseData.expected_tool_calls ?? []).map((t) => ({
          name: t.name,
          arguments: t.arguments,
        })),
        steps: (caseData.expected_tool_calls ?? []).map((t) => ({
          type: 'tool_call' as const,
          toolName: t.name,
          output: 'mocked',
        })),
        durationMs: Date.now() - startTime,
        costUsd: 0,
      };
    }

    const inputText =
      typeof caseData.input === 'string'
        ? caseData.input
        : 'text' in caseData.input
          ? caseData.input.text
          : JSON.stringify(caseData.input);

    return {
      output: `[local-mock] ${inputText.slice(0, 200)}`,
      toolCalls: [],
      steps: [],
      durationMs: Date.now() - startTime,
      costUsd: 0,
    };
  };
}

/**
 * Run an experiment.
 *
 * Self-contained API: if no `runCase` callback is provided, uses a default
 * local runner (mock mode returns expected output, otherwise placeholder).
 *
 * For real agent execution via Temporal, pass a custom `runCase` callback
 * or use the platform API (`POST /v1/eval/experiments`).
 */
export async function runExperiment(
  experiment: ExperimentDefinition,
  runCase?: CaseRunnerFn,
): Promise<ExperimentResult> {
  const dataset =
    typeof experiment.dataset === 'string'
      ? null
      : experiment.dataset;

  if (!dataset) {
    throw new Error('Local experiment run requires inline dataset (not a string reference)');
  }

  const runner = runCase ?? defaultLocalRunner(experiment.toolMode ?? 'mock');
  const parallelism = experiment.parallelism ?? 5;
  const caseResults: CaseResult[] = [];
  const startTime = Date.now();

  const cases = dataset.cases;
  for (let batchStart = 0; batchStart < cases.length; batchStart += parallelism) {
    const batch = cases.slice(batchStart, batchStart + parallelism);
    const batchResults = await Promise.all(
      batch.map(async (caseData, batchIndex) => {
        const caseIndex = batchStart + batchIndex;
        try {
          const result = await runner(caseData, caseIndex);

          const context: GraderContext = {
            input: caseData.input,
            output: result.output,
            expectedOutput: caseData.expected_output,
            expectedToolCalls: caseData.expected_tool_calls,
            expectedTrajectory: caseData.expected_trajectory,
            actualToolCalls: result.toolCalls,
            actualSteps: result.steps,
          };

          const scores: Record<string, ScoreResult> = {};
          for (const grader of experiment.graders) {
            const score = await grader.grade(context);
            scores[grader.name] = score;
          }

          const scoreValues = Object.values(scores).map((s) => s.score);
          const avgScore = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;

          return {
            caseIndex,
            input: caseData.input,
            output: result.output,
            scores,
            passed: avgScore >= 0.5,
            durationMs: result.durationMs,
            costUsd: result.costUsd,
          } satisfies CaseResult;
        } catch (err) {
          return {
            caseIndex,
            input: caseData.input,
            output: '',
            scores: {},
            passed: false,
            durationMs: 0,
            costUsd: 0,
            error: err instanceof Error ? err.message : String(err),
          } satisfies CaseResult;
        }
      }),
    );

    caseResults.push(...batchResults);
  }

  const summaryScores: Record<string, number> = {};
  const graderTotals: Record<string, { sum: number; count: number }> = {};

  for (const cr of caseResults) {
    for (const [name, score] of Object.entries(cr.scores)) {
      if (!graderTotals[name]) graderTotals[name] = { sum: 0, count: 0 };
      graderTotals[name].sum += score.score;
      graderTotals[name].count++;
    }
  }

  for (const [name, totals] of Object.entries(graderTotals)) {
    summaryScores[name] = Number((totals.sum / totals.count).toFixed(4));
  }

  return {
    name: experiment.name,
    summaryScores,
    totalCases: caseResults.length,
    passedCases: caseResults.filter((c) => c.passed).length,
    failedCases: caseResults.filter((c) => !c.passed).length,
    totalCostUsd: caseResults.reduce((sum, c) => sum + c.costUsd, 0),
    totalDurationMs: Date.now() - startTime,
    caseResults,
  };
}
