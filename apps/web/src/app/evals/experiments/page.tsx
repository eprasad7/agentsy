"use client";

import { FlaskConical, Filter } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { ScoreBadge } from "@/components/score-badge";
import { apiClient, type Agent, type EvalExperiment, ApiClientError } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

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

export default function ExperimentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><p className="text-sm text-text-secondary">Loading...</p></div>}>
      <ExperimentsContent />
    </Suspense>
  );
}

function ExperimentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [experiments, setExperiments] = useState<EvalExperiment[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [agentFilter, setAgentFilter] = useState(searchParams.get("agent_id") ?? "");

  const loadExperiments = useCallback(
    (nextCursor?: string) => {
      setLoading(true);
      const params: Record<string, string | undefined> = {
        cursor: nextCursor,
        status: statusFilter || undefined,
        agent_id: agentFilter || undefined,
      };

      apiClient.evalExperiments
        .list(params)
        .then((res) => {
          if (nextCursor) {
            setExperiments((prev) => [...prev, ...res.data]);
          } else {
            setExperiments(res.data);
          }
          setHasMore(res.has_more);
          setCursor(res.next_cursor);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiClientError) setError(e.message);
          else setError("Failed to load experiments");
        })
        .finally(() => setLoading(false));
    },
    [statusFilter, agentFilter],
  );

  useEffect(() => {
    loadExperiments();
  }, [loadExperiments]);

  useEffect(() => {
    apiClient.agents
      .list({ limit: "100" })
      .then((res) => setAgents(res.data))
      .catch(() => {});
  }, []);

  function handleFilterChange() {
    setCursor(null);
    setExperiments([]);
    loadExperiments();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Experiments</h1>
        <p className="mt-1 text-sm text-text-secondary">
          View eval experiment results across all agents.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-text-tertiary" />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setTimeout(handleFilterChange, 0);
          }}
          className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
          style={{ minHeight: 44 }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={agentFilter}
          onChange={(e) => {
            setAgentFilter(e.target.value);
            setTimeout(handleFilterChange, 0);
          }}
          className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
          style={{ minHeight: 44 }}
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
      )}

      {loading && experiments.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-text-secondary">Loading...</p>
        </div>
      ) : experiments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <FlaskConical className="h-6 w-6" />
          </div>
          <h2 className="text-md font-semibold text-text-primary">No experiments yet</h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            Run an experiment via the API or CLI to see results here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Scores</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">Cases</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">Created</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((exp) => {
                const agent = agents.find((a) => a.id === exp.agent_id);
                return (
                  <tr
                    key={exp.id}
                    onClick={() => router.push(`/evals/experiments/${exp.id}`)}
                    className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={exp.status} />
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {exp.name ?? exp.id.slice(0, 12)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {agent?.name ?? exp.agent_id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {exp.summary_scores && Object.entries(exp.summary_scores).map(([name, score]) => (
                          <ScoreBadge key={name} score={score} label={name} />
                        ))}
                        {(!exp.summary_scores || Object.keys(exp.summary_scores).length === 0) && (
                          <span className="text-xs text-text-tertiary">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {exp.passed_cases}/{exp.total_cases}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {new Date(exp.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border px-4 py-3 text-center">
              <button
                onClick={() => cursor && loadExperiments(cursor)}
                disabled={loading}
                className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
                style={{ minHeight: 44 }}
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
