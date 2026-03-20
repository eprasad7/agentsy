"use client";

import { ArrowLeft, Bot, Clock, Cpu, DollarSign, Hash } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { TraceViewer } from "@/components/trace-viewer";
import { apiClient, type Run, type RunStep, ApiClientError } from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium";
  switch (status) {
    case "completed":
      return <span className={`${base} bg-success-100 text-success-700`}>Completed</span>;
    case "running":
      return <span className={`${base} bg-primary-100 text-primary-700`}>Running</span>;
    case "queued":
      return <span className={`${base} bg-neutral-100 text-neutral-700`}>Queued</span>;
    case "awaiting_approval":
      return <span className={`${base} bg-warning-100 text-warning-700`}>Awaiting Approval</span>;
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
  if (!cost) return "$0.00";
  const num = parseFloat(cost);
  return `$${num.toFixed(4)}`;
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [runData, stepsData] = await Promise.all([
          apiClient.runs.get(params.id),
          apiClient.runs.steps(params.id, { limit: "100" }),
        ]);
        setRun(runData);
        setSteps(stepsData.data);
      } catch (e: unknown) {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load run");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4">
        <Link
          href="/runs"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to runs
        </Link>
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
          {error ?? "Run not found"}
        </div>
      </div>
    );
  }

  const totalTokens =
    (run.total_tokens_in ?? 0) + (run.total_tokens_out ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/runs"
          className="flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="Back to runs"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-text-primary">Run Detail</h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-text-tertiary">{run.id}</p>
        </div>
      </div>

      {/* Metadata cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Bot className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Agent</span>
          </div>
          <Link
            href={`/agents/${run.agent_id}`}
            className="block truncate text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            {run.agent_id}
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Cpu className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Model</span>
          </div>
          <p className="truncate text-sm font-medium text-text-primary">
            {run.model ?? "-"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Cost</span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {formatCost(run.total_cost_usd)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Duration</span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {formatDuration(run.duration_ms)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Hash className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Tokens</span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {totalTokens > 0 ? totalTokens.toLocaleString() : "-"}
          </p>
        </div>
      </div>

      {/* Input / Output */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-3">
          <h2 className="text-md font-semibold text-text-primary">Input</h2>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-hover p-3 font-mono text-xs text-text-secondary leading-relaxed">
            {run.input ? JSON.stringify(run.input, null, 2) : "-"}
          </pre>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-3">
          <h2 className="text-md font-semibold text-text-primary">Output</h2>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-hover p-3 font-mono text-xs text-text-secondary leading-relaxed">
            {run.output ? JSON.stringify(run.output, null, 2) : "-"}
          </pre>
        </div>
      </div>

      {/* Error display */}
      {run.error && (
        <div className="rounded-xl border border-error-300 bg-error-50 p-6 space-y-3">
          <h2 className="text-md font-semibold text-error-700">Error</h2>
          <pre className="whitespace-pre-wrap font-mono text-xs text-error-700 leading-relaxed">
            {typeof run.error === "string" ? run.error : JSON.stringify(run.error, null, 2)}
          </pre>
        </div>
      )}

      {/* Trace viewer */}
      <TraceViewer
        steps={steps}
        totalDurationMs={run.duration_ms}
        totalCostUsd={run.total_cost_usd}
      />

      {/* Timestamps */}
      <div className="rounded-xl border border-border bg-surface-card p-6">
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Created</p>
            <p className="mt-1 text-text-primary">{new Date(run.created_at).toLocaleString()}</p>
          </div>
          {run.started_at && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Started</p>
              <p className="mt-1 text-text-primary">{new Date(run.started_at).toLocaleString()}</p>
            </div>
          )}
          {run.completed_at && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Completed</p>
              <p className="mt-1 text-text-primary">{new Date(run.completed_at).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
