import type { ExperimentResult, ComparisonResult, CaseDiff } from './types.js';

const REGRESSION_THRESHOLD = 0.05;

/**
 * Compare two experiment results side-by-side.
 * Returns per-case score deltas and classification.
 */
export function compareExperiments(
  baseline: ExperimentResult,
  candidate: ExperimentResult,
): ComparisonResult {
  const caseDiffs: CaseDiff[] = [];
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;

  const caseCount = Math.min(baseline.caseResults.length, candidate.caseResults.length);

  for (let i = 0; i < caseCount; i++) {
    const a = baseline.caseResults[i]!;
    const b = candidate.caseResults[i]!;

    const scoresA: Record<string, number> = {};
    const scoresB: Record<string, number> = {};
    const deltas: Record<string, number> = {};

    for (const [key, val] of Object.entries(a.scores)) {
      scoresA[key] = val.score;
    }
    for (const [key, val] of Object.entries(b.scores)) {
      scoresB[key] = val.score;
    }

    const allGraders = new Set([...Object.keys(scoresA), ...Object.keys(scoresB)]);
    let maxDelta = 0;

    for (const grader of allGraders) {
      const va = scoresA[grader] ?? 0;
      const vb = scoresB[grader] ?? 0;
      const delta = Number((vb - va).toFixed(4));
      deltas[grader] = delta;
      if (Math.abs(delta) > Math.abs(maxDelta)) {
        maxDelta = delta;
      }
    }

    let classification: 'improved' | 'regressed' | 'unchanged';
    if (maxDelta > REGRESSION_THRESHOLD) {
      classification = 'improved';
      improved++;
    } else if (maxDelta < -REGRESSION_THRESHOLD) {
      classification = 'regressed';
      regressed++;
    } else {
      classification = 'unchanged';
      unchanged++;
    }

    caseDiffs.push({ caseIndex: i, scoresA, scoresB, deltas, classification });
  }

  // Summary deltas
  const summaryDeltas: Record<string, number> = {};
  const allKeys = new Set([
    ...Object.keys(baseline.summaryScores),
    ...Object.keys(candidate.summaryScores),
  ]);
  for (const key of allKeys) {
    summaryDeltas[key] = Number(
      ((candidate.summaryScores[key] ?? 0) - (baseline.summaryScores[key] ?? 0)).toFixed(4),
    );
  }

  return { summaryDeltas, improved, regressed, unchanged, caseDiffs };
}
