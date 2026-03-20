import type {
  ExperimentDefinition,
  ExperimentResult,
  CaseResult,
  DatasetDefinition,
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
 * Run an experiment locally (in-process).
 * This is the local execution path used by the CLI.
 * The agent run is simulated — for real agent runs, use the Temporal workflow via the API.
 *
 * @param experiment - Experiment definition
 * @param runCase - Function that executes a single agent run and returns the output + steps
 */
export async function runExperiment(
  experiment: ExperimentDefinition,
  runCase: (
    caseData: DatasetDefinition['cases'][number],
    index: number,
  ) => Promise<{
    output: string;
    toolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>;
    steps: Array<{ type: string; toolName?: string; output?: string }>;
    durationMs: number;
    costUsd: number;
  }>,
): Promise<ExperimentResult> {
  const dataset =
    typeof experiment.dataset === 'string'
      ? null // Remote dataset — caller must resolve
      : experiment.dataset;

  if (!dataset) {
    throw new Error('Local experiment run requires inline dataset (not a string reference)');
  }

  const parallelism = experiment.parallelism ?? 5;
  const caseResults: CaseResult[] = [];
  const startTime = Date.now();

  // Process cases with controlled parallelism
  const cases = dataset.cases;
  for (let batchStart = 0; batchStart < cases.length; batchStart += parallelism) {
    const batch = cases.slice(batchStart, batchStart + parallelism);
    const batchResults = await Promise.all(
      batch.map(async (caseData, batchIndex) => {
        const caseIndex = batchStart + batchIndex;
        try {
          const result = await runCase(caseData, caseIndex);

          // Grade the result
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

          // Case passes if average score >= 0.5
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

  // Aggregate summary scores
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
