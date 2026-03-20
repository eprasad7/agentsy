import { describe, expect, it } from 'vitest';

import { PLAN_LIMITS } from '../lib/rate-limiter.js';

describe('Rate Limiter', () => {
  it('has limits for all plan types', () => {
    expect(PLAN_LIMITS['free']).toBeDefined();
    expect(PLAN_LIMITS['pro']).toBeDefined();
    expect(PLAN_LIMITS['team']).toBeDefined();
    expect(PLAN_LIMITS['enterprise']).toBeDefined();
  });

  it('enterprise has higher limits than free', () => {
    const free = PLAN_LIMITS['free']!;
    const enterprise = PLAN_LIMITS['enterprise']!;
    expect(enterprise.requestsPerMin).toBeGreaterThan(free.requestsPerMin);
    expect(enterprise.tokensPerDay).toBeGreaterThan(free.tokensPerDay);
    expect(enterprise.concurrentRuns).toBeGreaterThan(free.concurrentRuns);
  });

  it('free plan has 20 requests per minute', () => {
    expect(PLAN_LIMITS['free']!.requestsPerMin).toBe(20);
  });

  it('free plan has 2 concurrent runs', () => {
    expect(PLAN_LIMITS['free']!.concurrentRuns).toBe(2);
  });
});
