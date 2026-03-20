"use client";

import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EvalComparison, type ComparisonData } from "@/components/eval-comparison";
import { ScoreBadge } from "@/components/score-badge";
import {
  apiClient,
  type EvalExperiment,
  type EvalExperimentResult,
  ApiClientError,
} from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  const base = "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium";
  switch (status) {
    case "completed":
      return <span className={`${base} bg-success-100 text-success-700`}>Completed</span>;
    case "running":
      return <span className={`${base} bg-primary-100 text-primary-700`}>Running</span>;
    case "queued":
      return <span className={`${base} bg-neutral-100 text-neutral-700`}>Queued</span>;
    case "failed":
      return <span className={`${base} bg-error-100 text-error-700`}>Failed</span>;
    default:
      return <span className={`${base} bg-neutral-100 text-neutral-700`}>{status}</span>;
  }
}

export default function ExperimentDetailPage() {
  const params = useParams<{ id: string }>();
  const [experiment, setExperiment] = useState<EvalExperiment | null>(null);
  const [results, setResults] = useState<EvalExperimentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;

    Promise.all([
      apiClient.evalExperiments.get(params.id),
      apiClient.evalExperiments.results(params.id, { limit: "100" }),
    ])
      .then(([exp, res]) => {
        setExperiment(exp);
        setResults(res.data);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load experiment");
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (error || !experiment) {
    return (
      <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
        {error ?? "Experiment not found"}
      </div>
    );
  }

  const graderNames = new Set<string>();
  for (const r of results) {
    if (r.scores) {
      for (const name of Object.keys(r.scores)) {
        graderNames.add(name);
      }
    }
  }
  const graders = [...graderNames];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/evals/experiments"
          className="flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-text-primary">
            {experiment.name ?? `Experiment ${experiment.id.slice(0, 12)}`}
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {experiment.id}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium uppercase text-text-tertiary">Status</p>
          <div className="mt-1">
            <StatusBadge status={experiment.status} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium uppercase text-text-tertiary">Cases</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">
            {experiment.passed_cases}/{experiment.total_cases}
            <span className="ml-1 text-sm font-normal text-text-secondary">passed</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium uppercase text-text-tertiary">Cost</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">
            ${experiment.total_cost_usd.toFixed(3)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium uppercase text-text-tertiary">Duration</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">
            {experiment.total_duration_ms
              ? `${(experiment.total_duration_ms / 1000).toFixed(1)}s`
              : "-"}
          </p>
        </div>
      </div>

      {/* Summary scores */}
      {experiment.summary_scores && Object.keys(experiment.summary_scores).length > 0 && (
        <div className="rounded-xl border border-border bg-surface-card p-4">
          <h2 className="text-sm font-semibold text-text-primary">Summary Scores</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {Object.entries(experiment.summary_scores).map(([name, score]) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <span className="text-xs text-text-tertiary">{name}</span>
                <ScoreBadge score={score} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-case results */}
      <div className="rounded-xl border border-border bg-surface-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Per-Case Results</h2>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">
            No results yet. The experiment may still be running.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Case
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Passed
                </th>
                {graders.map((g) => (
                  <th
                    key={g}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
                  >
                    {g}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const isExpanded = expandedCase === r.id;
                return (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setExpandedCase(isExpanded ? null : r.id)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-text-tertiary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-text-tertiary" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary">
                        Case {i + 1}
                      </td>
                      <td className="px-4 py-3">
                        {r.passed === true && (
                          <span className="inline-flex items-center rounded-full bg-success-100 px-2 py-1 text-xs font-medium text-success-700">
                            Pass
                          </span>
                        )}
                        {r.passed === false && (
                          <span className="inline-flex items-center rounded-full bg-error-100 px-2 py-1 text-xs font-medium text-error-700">
                            Fail
                          </span>
                        )}
                        {r.passed === null && (
                          <span className="text-xs text-text-tertiary">-</span>
                        )}
                      </td>
                      {graders.map((g) => {
                        const score = r.scores?.[g];
                        return (
                          <td key={g} className="px-4 py-3">
                            {score ? <ScoreBadge score={score.score} /> : <span className="text-xs text-text-tertiary">-</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right text-text-secondary">
                        {r.duration_ms !== null ? `${(r.duration_ms / 1000).toFixed(1)}s` : "-"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${r.id}-details`} className="border-b border-border">
                        <td colSpan={3 + graders.length + 1} className="bg-surface-secondary px-8 py-4">
                          <div className="space-y-3">
                            {r.output && (
                              <div>
                                <p className="text-xs font-medium uppercase text-text-tertiary">Output</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                                  {r.output.slice(0, 500)}
                                  {r.output.length > 500 && "..."}
                                </p>
                              </div>
                            )}
                            {r.error && (
                              <div>
                                <p className="text-xs font-medium uppercase text-text-tertiary">Error</p>
                                <p className="mt-1 text-sm text-error-700">{r.error}</p>
                              </div>
                            )}
                            {r.scores && Object.entries(r.scores).map(([name, score]) => (
                              score.reasoning && (
                                <div key={name}>
                                  <p className="text-xs font-medium uppercase text-text-tertiary">
                                    {name} reasoning
                                  </p>
                                  <p className="mt-1 text-sm text-text-secondary">{score.reasoning}</p>
                                </div>
                              )
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Compare with another experiment */}
      <CompareSection experimentId={experiment.id} />
    </div>
  );
}

function CompareSection({ experimentId }: { experimentId: string }) {
  const [compareId, setCompareId] = useState("");
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  async function handleCompare() {
    if (!compareId.trim()) return;
    setCompareLoading(true);
    setCompareError(null);
    try {
      const data = await apiClient.evalExperiments.compare(experimentId, compareId.trim());
      setComparisonData(data as unknown as ComparisonData);
    } catch (e: unknown) {
      setCompareError(e instanceof ApiClientError ? e.message : "Comparison failed");
    } finally {
      setCompareLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Compare Experiments</h2>
      </div>
      <div className="p-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter experiment ID to compare (exp_...)"
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface-page px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={handleCompare}
            disabled={compareLoading || !compareId.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {compareLoading ? "Comparing..." : "Compare"}
          </button>
        </div>
        {compareError && (
          <p className="mt-2 text-sm text-error-600">{compareError}</p>
        )}
        {comparisonData && (
          <div className="mt-4">
            <EvalComparison data={comparisonData} />
          </div>
        )}
      </div>
    </div>
  );
}
