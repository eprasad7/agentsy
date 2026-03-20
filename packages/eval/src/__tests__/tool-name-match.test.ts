import { describe, it, expect } from 'vitest';

import { toolNameMatch } from '../graders/tool-name-match.js';
import type { GraderContext } from '../types.js';

function ctx(
  expected: Array<{ name: string }>,
  actual: Array<{ name: string }>,
): GraderContext {
  return {
    input: 'test',
    output: '',
    expectedToolCalls: expected,
    actualToolCalls: actual,
  };
}

describe('toolNameMatch', () => {
  it('scores 1.0 when all expected tools called', () => {
    const grader = toolNameMatch();
    const result = grader.grade(ctx(
      [{ name: 'search' }, { name: 'write' }],
      [{ name: 'search' }, { name: 'write' }, { name: 'read' }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores partial for missing tools', async () => {
    const grader = toolNameMatch();
    const result = await grader.grade(ctx(
      [{ name: 'search' }, { name: 'write' }],
      [{ name: 'search' }],
    ));
    expect(result.score).toBeCloseTo(0.5);
  });

  it('scores 0 when no expected tools called', () => {
    const grader = toolNameMatch();
    const result = grader.grade(ctx(
      [{ name: 'search' }],
      [{ name: 'other' }],
    ));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('strict mode requires exact set', () => {
    const grader = toolNameMatch({ strict: true });
    const result = grader.grade(ctx(
      [{ name: 'search' }],
      [{ name: 'search' }, { name: 'write' }],
    ));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('strict mode passes for exact set', () => {
    const grader = toolNameMatch({ strict: true });
    const result = grader.grade(ctx(
      [{ name: 'search' }, { name: 'write' }],
      [{ name: 'write' }, { name: 'search' }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores 1.0 when no expected tools defined', () => {
    const grader = toolNameMatch();
    const result = grader.grade(ctx([], [{ name: 'anything' }]));
    expect(result).toMatchObject({ score: 1.0 });
  });
});
