import { describe, it, expect } from 'vitest';

import { toolArgsMatch } from '../graders/tool-args-match.js';
import type { GraderContext } from '../types.js';

function ctx(
  expected: Array<{ name: string; arguments?: Record<string, unknown> }>,
  actual: Array<{ name: string; arguments?: Record<string, unknown> }>,
): GraderContext {
  return {
    input: 'test',
    output: '',
    expectedToolCalls: expected,
    actualToolCalls: actual,
  };
}

describe('toolArgsMatch', () => {
  it('scores 1.0 when all args match', () => {
    const grader = toolArgsMatch();
    const result = grader.grade(ctx(
      [{ name: 'search', arguments: { query: 'test' } }],
      [{ name: 'search', arguments: { query: 'test', limit: 10 } }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores 0 when tool not called', () => {
    const grader = toolArgsMatch();
    const result = grader.grade(ctx(
      [{ name: 'search', arguments: { query: 'test' } }],
      [{ name: 'other' }],
    ));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('scores 0 when args mismatch', () => {
    const grader = toolArgsMatch();
    const result = grader.grade(ctx(
      [{ name: 'search', arguments: { query: 'test' } }],
      [{ name: 'search', arguments: { query: 'different' } }],
    ));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('partial match ignores extra keys in actual', () => {
    const grader = toolArgsMatch();
    const result = grader.grade(ctx(
      [{ name: 'search', arguments: { query: 'test' } }],
      [{ name: 'search', arguments: { query: 'test', extra: true } }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('matches by name only when no args expected', () => {
    const grader = toolArgsMatch();
    const result = grader.grade(ctx(
      [{ name: 'search' }],
      [{ name: 'search', arguments: { anything: true } }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('handles missing keys in actual', () => {
    const grader = toolArgsMatch();
    const result = grader.grade(ctx(
      [{ name: 'search', arguments: { query: 'test', limit: 5 } }],
      [{ name: 'search', arguments: { query: 'test' } }],
    ));
    expect(result).toMatchObject({ score: 0.0 });
  });
});
