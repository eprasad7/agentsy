import { formatComparison } from '../formatters/eval-report.js';

export interface CompareOptions {
  baselineId: string;
  candidateId: string;
  format: 'table' | 'json';
}

export async function runCompareCommand(opts: CompareOptions): Promise<void> {
  const apiUrl = process.env['AGENTSY_API_URL'] ?? 'http://localhost:3001';
  const apiKey = process.env['AGENTSY_API_KEY'];

  if (!apiKey) {
    console.error('AGENTSY_API_KEY is required for remote comparison.');
    console.error('Set it in your environment or .env file.');
    process.exit(1);
  }

  const url = `${apiUrl}/v1/eval/experiments/compare?experiment_a=${encodeURIComponent(opts.baselineId)}&experiment_b=${encodeURIComponent(opts.candidateId)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`API error (${response.status}): ${body}`);
    process.exit(1);
  }

  const data = (await response.json()) as {
    summary_deltas: Record<string, number>;
    improved: number;
    regressed: number;
    unchanged: number;
    per_case_diffs: Array<{
      case_id: string;
      scores_a: Record<string, number>;
      scores_b: Record<string, number>;
      deltas: Record<string, number>;
      classification: string;
    }>;
  };

  if (opts.format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Convert API response to ComparisonResult format
  const comparison = {
    summaryDeltas: data.summary_deltas,
    improved: data.improved,
    regressed: data.regressed,
    unchanged: data.unchanged,
    caseDiffs: data.per_case_diffs.map((d, i) => ({
      caseIndex: i,
      scoresA: d.scores_a,
      scoresB: d.scores_b,
      deltas: d.deltas,
      classification: d.classification as 'improved' | 'regressed' | 'unchanged',
    })),
  };

  console.log(formatComparison(comparison));

  if (data.regressed > 0) {
    console.error(`\n${data.regressed} case(s) regressed.`);
    process.exit(1);
  }
}
