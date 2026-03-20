import { proxyActivities } from '@temporalio/workflow';

const activities = proxyActivities<typeof import('../activities/index.js')>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 2 },
});

const evalActivities = proxyActivities<typeof import('../activities/eval-grading.js')>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 1 },
});

// ── Workflow Input ──────────────────────────────────────────────────

export interface EvalExperimentInput {
  experimentId: string;
  datasetId: string;
  agentId: string;
  versionId: string;
  orgId: string;
  config: {
    toolMode?: 'mock' | 'dry-run' | 'live';
    graders?: Array<{
      name: string;
      type: string;
      config?: Record<string, unknown>;
    }>;
    parallelism?: number;
    judgeModel?: string;
  };
}

// ── Main Workflow ───────────────────────────────────────────────────

export async function EvalExperimentWorkflow(input: EvalExperimentInput): Promise<void> {
  const { experimentId, datasetId, agentId, versionId, orgId, config } = input;
  const parallelism = config.parallelism ?? 5;
  const startedAt = Date.now();

  // 1. Mark experiment as running
  await evalActivities.updateExperimentStatus({
    experimentId,
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  try {
    // 2. Load all cases from dataset
    const cases = await evalActivities.loadDatasetCases({ datasetId, orgId });

    // 3. Process cases with controlled parallelism
    let passedCases = 0;
    let failedCases = 0;
    let totalCostUsd = 0;

    const summaryTotals: Record<string, { sum: number; count: number }> = {};

    for (let batchStart = 0; batchStart < cases.length; batchStart += parallelism) {
      const batch = cases.slice(batchStart, batchStart + parallelism);

      const batchResults = await Promise.all(
        batch.map(async (caseData) => {
          const caseStartTime = Date.now();

          try {
            // Run agent for this case
            const runResult = await evalActivities.runAgentForEvalCase({
              agentId,
              versionId,
              orgId,
              caseInput: caseData.input,
              sessionHistory: caseData.sessionHistory,
              mockedToolResults: caseData.mockedToolResults,
              toolMode: config.toolMode ?? 'mock',
            });

            // Grade the result
            const gradeResult = await evalActivities.gradeEvalCase({
              input: caseData.input,
              output: runResult.output,
              expectedOutput: caseData.expectedOutput,
              expectedToolCalls: caseData.expectedToolCalls,
              expectedTrajectory: caseData.expectedTrajectory,
              actualToolCalls: runResult.toolCalls,
              actualSteps: runResult.steps,
              graders: config.graders ?? [],
              judgeModel: config.judgeModel,
            });

            const caseDurationMs = Date.now() - caseStartTime;

            // Persist result
            await evalActivities.persistEvalResult({
              experimentId,
              caseId: caseData.id,
              orgId,
              runId: runResult.runId,
              output: runResult.output,
              scores: gradeResult.scores,
              passed: gradeResult.passed,
              durationMs: caseDurationMs,
              costUsd: runResult.costUsd,
            });

            return {
              passed: gradeResult.passed,
              costUsd: runResult.costUsd,
              scores: gradeResult.scores,
            };
          } catch (err) {
            const caseDurationMs = Date.now() - caseStartTime;

            // Persist error result
            await evalActivities.persistEvalResult({
              experimentId,
              caseId: caseData.id,
              orgId,
              output: '',
              scores: {},
              passed: false,
              durationMs: caseDurationMs,
              costUsd: 0,
              error: err instanceof Error ? err.message : String(err),
            });

            return { passed: false, costUsd: 0, scores: {} };
          }
        }),
      );

      // Aggregate batch results
      for (const result of batchResults) {
        if (result.passed) passedCases++;
        else failedCases++;
        totalCostUsd += result.costUsd;

        for (const [name, score] of Object.entries(result.scores)) {
          if (!summaryTotals[name]) summaryTotals[name] = { sum: 0, count: 0 };
          summaryTotals[name].sum += (score as { score: number }).score;
          summaryTotals[name].count++;
        }
      }
    }

    // 4. Compute summary scores
    const summaryScores: Record<string, number> = {};
    for (const [name, totals] of Object.entries(summaryTotals)) {
      summaryScores[name] = Number((totals.sum / totals.count).toFixed(4));
    }

    // 5. Mark experiment as completed
    await evalActivities.updateExperimentStatus({
      experimentId,
      status: 'completed',
      summaryScores,
      passedCases,
      failedCases,
      totalCostUsd,
      totalDurationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    });

    // 6. Auto-compare against baseline if one exists
    await evalActivities.autoCompareWithBaseline({
      experimentId,
      agentId,
      datasetId,
      orgId,
    });
  } catch (err) {
    await evalActivities.updateExperimentStatus({
      experimentId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      totalDurationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    });
  }
}
