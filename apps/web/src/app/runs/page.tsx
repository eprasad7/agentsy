"use client";

import { Filter, Play } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { apiClient, type Agent, type Run, ApiClientError } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "awaiting_approval", label: "Awaiting Approval" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "timeout", label: "Timeout" },
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
    case "awaiting_approval":
      return <span className={`${base} bg-warning-100 text-warning-700`}>Awaiting</span>;
    case "failed":
      return <span className={`${base} bg-error-100 text-error-700`}>Failed</span>;
    case "cancelled":
      return <span className={`${base} bg-neutral-200 text-neutral-600`}>Cancelled</span>;
    case "timeout":
      return <span className={`${base} bg-warning-100 text-warning-700`}>Timeout</span>;
    default:
      return <span className={`${base} bg-neutral-100 text-neutral-700`}>{status}</span>;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: string | null): string {
  if (!cost) return "-";
  const num = parseFloat(cost);
  if (num === 0) return "$0.00";
  if (num < 0.01) return "<$0.01";
  return `$${num.toFixed(2)}`;
}

function truncateInput(input: unknown): string {
  if (!input) return "-";
  if (typeof input === "string") return input.length > 60 ? input.slice(0, 60) + "..." : input;
  const typed = input as Record<string, unknown>;
  if (typed.type === "text" && typeof typed.text === "string") {
    const text = typed.text as string;
    return text.length > 60 ? text.slice(0, 60) + "..." : text;
  }
  return JSON.stringify(input).slice(0, 60) + "...";
}

export default function RunsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><p className="text-sm text-text-secondary">Loading...</p></div>}>
      <RunsContent />
    </Suspense>
  );
}

function RunsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<Run[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [agentFilter, setAgentFilter] = useState(searchParams.get("agent_id") ?? "");

  const loadRuns = useCallback(
    (nextCursor?: string) => {
      setLoading(true);
      const params: Record<string, string | undefined> = {
        cursor: nextCursor,
        status: statusFilter || undefined,
        agent_id: agentFilter || undefined,
      };

      apiClient.runs
        .list(params)
        .then((res) => {
          if (nextCursor) {
            setRuns((prev) => [...prev, ...res.data]);
          } else {
            setRuns(res.data);
          }
          setHasMore(res.has_more);
          setCursor(res.next_cursor);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiClientError) setError(e.message);
          else setError("Failed to load runs");
        })
        .finally(() => setLoading(false));
    },
    [statusFilter, agentFilter],
  );

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    apiClient.agents
      .list({ limit: "100" })
      .then((res) => setAgents(res.data))
      .catch(() => {
        /* ignore - agents dropdown just won't populate */
      });
  }, []);

  function handleFilterChange() {
    setCursor(null);
    setRuns([]);
    loadRuns();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Runs</h1>
        <p className="mt-1 text-sm text-text-secondary">
          View and filter all agent runs.
        </p>
      </div>

      {/* Filters */}
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
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
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
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
      )}

      {loading && runs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-text-secondary">Loading...</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Play className="h-6 w-6" />
          </div>
          <h2 className="text-md font-semibold text-text-primary">No runs found</h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            {statusFilter || agentFilter
              ? "Try adjusting your filters."
              : "Runs will appear here once you start running agents."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Input
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const agent = agents.find((a) => a.id === run.agent_id);
                return (
                  <tr
                    key={run.id}
                    onClick={() => router.push(`/runs/${run.id}`)}
                    className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {agent?.name ?? run.agent_id}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-text-secondary">
                      {truncateInput(run.input)}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {formatCost(run.total_cost_usd)}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border px-4 py-3 text-center">
              <button
                onClick={() => cursor && loadRuns(cursor)}
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
