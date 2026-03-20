import { describe, it, expect } from 'vitest';

import { checkGuardrails, type LoopState } from '../guardrails/guardrail-checker.js';

function makeState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    iteration: 0,
    totalTokens: 0,
    totalCost: 0,
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('checkGuardrails', () => {
  it('passes when all values are within limits', () => {
    const result = checkGuardrails(makeState(), {});
    expect(result.violated).toBe(false);
  });

  it('triggers max_iterations', () => {
    const result = checkGuardrails(makeState({ iteration: 10 }), { maxIterations: 10 });
    expect(result.violated).toBe(true);
    expect(result.reason).toBe('max_iterations');
  });

  it('triggers max_tokens', () => {
    const result = checkGuardrails(makeState({ totalTokens: 50_000 }), { maxTokens: 50_000 });
    expect(result.violated).toBe(true);
    expect(result.reason).toBe('max_tokens');
  });

  it('triggers timeout', () => {
    const result = checkGuardrails(
      makeState({ startedAt: Date.now() - 400_000 }),
      { timeoutMs: 300_000 },
    );
    expect(result.violated).toBe(true);
    expect(result.reason).toBe('timeout');
  });

  it('uses defaults when no config provided', () => {
    // Default maxIterations = 10
    const result = checkGuardrails(makeState({ iteration: 10 }), undefined);
    expect(result.violated).toBe(true);
    expect(result.reason).toBe('max_iterations');
  });

  it('triggers max_cost_usd', () => {
    const result = checkGuardrails(makeState({ totalCost: 1.0 }), undefined);
    expect(result.violated).toBe(true);
    expect(result.reason).toBe('max_cost_usd');
  });

  it('triggers max_cost_usd with custom limit', () => {
    const result = checkGuardrails(makeState({ totalCost: 0.5 }), undefined);
    expect(result.violated).toBe(false);
  });

  it('does not trigger when just under limits', () => {
    const result = checkGuardrails(makeState({ iteration: 9, totalTokens: 49_999, totalCost: 0.99 }), {
      maxIterations: 10,
      maxTokens: 50_000,
    });
    expect(result.violated).toBe(false);
  });
});
