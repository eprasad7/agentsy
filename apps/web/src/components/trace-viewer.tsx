"use client";

import type { RunStep } from "@/lib/api";
import { TraceStep } from "./trace-step";

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: string | null): string {
  if (!cost) return "$0.000";
  const num = parseFloat(cost);
  return `$${num.toFixed(3)}`;
}

interface TraceViewerProps {
  steps: RunStep[];
  totalDurationMs?: number | null;
  totalCostUsd?: string | null;
}

export function TraceViewer({ steps, totalDurationMs, totalCostUsd }: TraceViewerProps) {
  if (steps.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-card px-6 py-12 text-center">
        <p className="text-sm text-text-secondary">No steps recorded for this run.</p>
      </div>
    );
  }

  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="rounded-xl border border-border bg-surface-card p-6 space-y-4">
      <h2 className="text-md font-semibold text-text-primary">Trace</h2>

      <div className="pl-1">
        {sortedSteps.map((step, i) => (
          <TraceStep
            key={step.id}
            step={step}
            isLast={i === sortedSteps.length - 1}
          />
        ))}
      </div>

      {/* Summary footer */}
      <div className="flex items-center gap-4 border-t border-border pt-4 text-xs text-text-secondary">
        <span>{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
        {totalCostUsd && <span>{formatCost(totalCostUsd)}</span>}
        {totalDurationMs !== null && totalDurationMs !== undefined && (
          <span>{formatDuration(totalDurationMs)}</span>
        )}
      </div>
    </div>
  );
}
