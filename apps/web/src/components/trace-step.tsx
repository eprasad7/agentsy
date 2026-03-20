"use client";

import { useState } from "react";
import type { RunStep } from "@/lib/api";
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Wrench,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Clock,
} from "lucide-react";

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: string | null): string {
  if (!cost) return "$0.000";
  const num = parseFloat(cost);
  if (num < 0.001) return "<$0.001";
  return `$${num.toFixed(3)}`;
}

function formatJson(data: unknown): string {
  if (data === null || data === undefined) return "null";
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function StepIcon({ type, approvalStatus }: { type: string; approvalStatus?: string | null }) {
  switch (type) {
    case "llm_call":
      return <Brain className="h-4 w-4 text-primary-500" />;
    case "tool_call":
      return <Wrench className="h-4 w-4 text-info-500" />;
    case "approval_request":
      if (approvalStatus === "approved") return <ShieldCheck className="h-4 w-4 text-success-500" />;
      if (approvalStatus === "denied") return <ShieldAlert className="h-4 w-4 text-error-500" />;
      return <Clock className="h-4 w-4 text-warning-500" />;
    case "guardrail":
      return <ShieldCheck className="h-4 w-4 text-success-500" />;
    default:
      if (type.includes("error")) return <AlertCircle className="h-4 w-4 text-error-500" />;
      return <Brain className="h-4 w-4 text-text-tertiary" />;
  }
}

function StepBadge({ type, approvalStatus }: { type: string; approvalStatus?: string | null }) {
  const labels: Record<string, string> = {
    llm_call: "LLM Call",
    tool_call: "Tool Call",
    approval_request: "Approval",
    guardrail: "Guardrail",
    error: "Error",
  };

  const label = labels[type] ?? type;

  const baseClasses = "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium";

  switch (type) {
    case "llm_call":
      return <span className={`${baseClasses} bg-primary-100 text-primary-700`}>{label}</span>;
    case "tool_call":
      return <span className={`${baseClasses} bg-info-100 text-info-700`}>{label}</span>;
    case "approval_request":
      if (approvalStatus === "approved")
        return <span className={`${baseClasses} bg-success-100 text-success-700`}>Approved</span>;
      if (approvalStatus === "denied")
        return <span className={`${baseClasses} bg-error-100 text-error-700`}>Denied</span>;
      return <span className={`${baseClasses} bg-warning-100 text-warning-700`}>Pending</span>;
    case "guardrail":
      return <span className={`${baseClasses} bg-success-100 text-success-700`}>{label}</span>;
    default:
      if (type.includes("error"))
        return <span className={`${baseClasses} bg-error-100 text-error-700`}>Error</span>;
      return <span className={`${baseClasses} bg-neutral-100 text-neutral-700`}>{label}</span>;
  }
}

export function TraceStep({ step, isLast }: { step: RunStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // Summary line for collapsed view
  function getSummary(): string {
    switch (step.type) {
      case "llm_call":
        return step.model ? `${step.model}` : "LLM Call";
      case "tool_call":
        return step.tool_name ?? "Tool Call";
      case "approval_request":
        return step.tool_name ? `Approval for ${step.tool_name}` : "Approval Request";
      case "guardrail":
        return "Guardrail check";
      default:
        return step.error ?? step.type;
    }
  }

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-card">
          <StepIcon type={step.type} approvalStatus={step.approval_status} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-6 ${isLast ? "" : ""}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-left"
          style={{ minHeight: 32 }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" />
          )}

          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-text-tertiary">
              Step {step.step_order}
            </span>
            <StepBadge type={step.type} approvalStatus={step.approval_status} />
            <span className="text-sm text-text-primary">{getSummary()}</span>
          </div>

          <div className="flex shrink-0 items-center gap-3 text-xs text-text-tertiary">
            {step.duration_ms !== null && <span>{formatDuration(step.duration_ms)}</span>}
            {step.cost_usd && <span>{formatCost(step.cost_usd)}</span>}
          </div>
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {/* LLM call details */}
            {step.type === "llm_call" && (
              <div className="space-y-2">
                {step.tokens_in !== null && step.tokens_out !== null && (
                  <p className="text-xs text-text-secondary">
                    Tokens: {step.tokens_in.toLocaleString()} in / {step.tokens_out.toLocaleString()} out
                  </p>
                )}
                {step.output && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Response</p>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-hover p-3 font-mono text-xs text-text-secondary leading-relaxed">
                      {typeof step.output === "string" ? step.output : formatJson(step.output)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Tool call details */}
            {step.type === "tool_call" && (
              <div className="space-y-2">
                {step.tool_name && (
                  <span className="inline-block rounded-md bg-surface-hover px-2 py-1 font-mono text-xs text-text-primary">
                    {step.tool_name}
                  </span>
                )}
                {step.input && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Input</p>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-hover p-3 font-mono text-xs text-text-secondary leading-relaxed">
                      {formatJson(step.input)}
                    </pre>
                  </div>
                )}
                {step.output && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Output</p>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-hover p-3 font-mono text-xs text-text-secondary leading-relaxed">
                      {formatJson(step.output)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Approval details */}
            {step.type === "approval_request" && (
              <div className="space-y-2">
                {step.approved_by && (
                  <p className="text-xs text-text-secondary">
                    Resolved by: <span className="font-medium text-text-primary">{step.approved_by}</span>
                  </p>
                )}
                {step.approval_wait_ms !== null && (
                  <p className="text-xs text-text-secondary">
                    Wait time: {formatDuration(step.approval_wait_ms)}
                  </p>
                )}
              </div>
            )}

            {/* Error details */}
            {step.error && (
              <div className="rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700">
                {step.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
