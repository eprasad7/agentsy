"use client";

import { ScoreBadge } from "./score-badge";

interface ExperimentSummary {
  id: string;
  name: string | null;
  version_id: string;
  summary_scores: Record<string, number>;
  total_cases: number;
  passed_cases: number;
}

interface CaseComparison {
  case_id: string;
  scores_a: Record<string, number>;
  scores_b: Record<string, number>;
  delta: number;
}

export interface ComparisonData {
  experiment_a: ExperimentSummary;
  experiment_b: ExperimentSummary;
  // API returns summary_deltas, improved, regressed, per_case_diffs
  summary_deltas: Record<string, number>;
  regressed: CaseComparison[];
  improved: CaseComparison[];
  unchanged: number;
  per_case_diffs?: CaseComparison[];
}

export function EvalComparison({ data }: { data: ComparisonData }) {
  const { experiment_a: a, experiment_b: b, summary_deltas: score_deltas, regressed: regressions, improved: improvements, unchanged } = data;
  const graderNames = Object.keys(score_deltas);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border-default bg-surface-card p-4">
          <div className="text-sm text-text-secondary">Improvements</div>
          <div className="mt-1 text-2xl font-semibold text-success-600">{improvements.length}</div>
        </div>
        <div className="rounded-lg border border-border-default bg-surface-card p-4">
          <div className="text-sm text-text-secondary">Regressions</div>
          <div className="mt-1 text-2xl font-semibold text-error-600">{regressions.length}</div>
        </div>
        <div className="rounded-lg border border-border-default bg-surface-card p-4">
          <div className="text-sm text-text-secondary">Unchanged</div>
          <div className="mt-1 text-2xl font-semibold text-text-secondary">{unchanged}</div>
        </div>
      </div>

      {/* Score deltas table */}
      <div className="rounded-lg border border-border-default bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default">
              <th className="px-4 py-3 text-left text-text-secondary font-medium">Grader</th>
              <th className="px-4 py-3 text-right text-text-secondary font-medium">{a.name ?? a.id.slice(0, 12)}</th>
              <th className="px-4 py-3 text-right text-text-secondary font-medium">{b.name ?? b.id.slice(0, 12)}</th>
              <th className="px-4 py-3 text-right text-text-secondary font-medium">Delta</th>
            </tr>
          </thead>
          <tbody>
            {graderNames.map((name) => {
              const scoreA = a.summary_scores[name] ?? 0;
              const scoreB = b.summary_scores[name] ?? 0;
              const delta = score_deltas[name] ?? 0;
              return (
                <tr key={name} className="border-b border-border-default last:border-0">
                  <td className="px-4 py-3 font-mono text-text-primary">{name}</td>
                  <td className="px-4 py-3 text-right"><ScoreBadge score={scoreA} /></td>
                  <td className="px-4 py-3 text-right"><ScoreBadge score={scoreB} /></td>
                  <td className="px-4 py-3 text-right">
                    <span className={delta > 0.05 ? "text-success-600" : delta < -0.05 ? "text-error-600" : "text-text-secondary"}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(4)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Regressions detail */}
      {regressions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-error-600">Regressions ({regressions.length})</h3>
          <div className="space-y-1">
            {regressions.map((r) => (
              <div key={r.case_id} className="flex items-center gap-3 rounded bg-error-50 px-3 py-2 text-sm dark:bg-error-950">
                <span className="font-mono text-text-secondary">{r.case_id.slice(0, 15)}</span>
                <span className="text-error-600">delta: {r.delta.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvements detail */}
      {improvements.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-success-600">Improvements ({improvements.length})</h3>
          <div className="space-y-1">
            {improvements.map((r) => (
              <div key={r.case_id} className="flex items-center gap-3 rounded bg-success-50 px-3 py-2 text-sm dark:bg-success-950">
                <span className="font-mono text-text-secondary">{r.case_id.slice(0, 15)}</span>
                <span className="text-success-600">delta: +{r.delta.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
