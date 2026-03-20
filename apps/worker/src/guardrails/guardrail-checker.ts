import { GUARDRAIL_DEFAULTS } from '@agentsy/shared';
import type { VersionGuardrailsConfig } from '@agentsy/db';

export interface LoopState {
  iteration: number;
  totalTokens: number;
  totalCost: number;
  startedAt: number; // Date.now()
}

export interface GuardrailCheckResult {
  violated: boolean;
  reason?: 'max_iterations' | 'max_tokens' | 'max_cost_usd' | 'timeout';
}

/**
 * Check guardrails before each agentic loop iteration.
 */
export function checkGuardrails(
  state: LoopState,
  config: VersionGuardrailsConfig | undefined,
): GuardrailCheckResult {
  const maxIterations = config?.maxIterations ?? GUARDRAIL_DEFAULTS.maxIterations;
  const maxTokens = config?.maxTokens ?? GUARDRAIL_DEFAULTS.maxTokens;
  const timeoutMs = config?.timeoutMs ?? GUARDRAIL_DEFAULTS.timeoutMs;

  // Check max_cost_usd — spec default is $1.00
  const maxCostUsd = (config as Record<string, unknown> | undefined)?.['maxCostUsd'] as number | undefined ?? 1.0;

  if (state.iteration >= maxIterations) {
    return { violated: true, reason: 'max_iterations' };
  }

  if (state.totalTokens >= maxTokens) {
    return { violated: true, reason: 'max_tokens' };
  }

  if (state.totalCost >= maxCostUsd) {
    return { violated: true, reason: 'max_cost_usd' };
  }

  if (Date.now() - state.startedAt >= timeoutMs) {
    return { violated: true, reason: 'timeout' };
  }

  return { violated: false };
}
