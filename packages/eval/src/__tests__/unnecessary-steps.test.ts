import { describe, it, expect } from 'vitest';

import { unnecessarySteps } from '../graders/unnecessary-steps.js';
import type { GraderContext } from '../types.js';

function ctx(
  expected: Array<{ type: 'tool_call'; toolName: string }>,
  actual: Array<{ type: string; toolName: string }>,
): GraderContext {
  return {
    input: 'test',
    output: '',
    expectedTrajectory: expected,
    actualSteps: actual,
  };
}

describe('unnecessarySteps', () => {
  it('scores 1.0 when all steps are necessary', () => {
    const grader = unnecessarySteps();
    const result = grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'b' }],
      [{ type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'b' }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('penalizes unnecessary steps', async () => {
    const grader = unnecessarySteps();
    const result = await grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }],
      [
        { type: 'tool_call', toolName: 'a' },
        { type: 'tool_call', toolName: 'unnecessary1' },
        { type: 'tool_call', toolName: 'unnecessary2' },
      ],
    ));
    // 2 unnecessary out of 3 total = 1 - 2/3 = 0.3333
    expect(result.score).toBeCloseTo(1 / 3, 2);
  });

  it('scores 1.0 with no actual steps', () => {
    const grader = unnecessarySteps();
    const result = grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }],
      [],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores 1.0 with no expected trajectory', () => {
    const grader = unnecessarySteps();
    const result = grader.grade(ctx(
      [],
      [{ type: 'tool_call', toolName: 'a' }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores 0 when all steps are unnecessary', () => {
    const grader = unnecessarySteps();
    const result = grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }],
      [{ type: 'tool_call', toolName: 'x' }, { type: 'tool_call', toolName: 'y' }],
    ));
    expect(result).toMatchObject({ score: 0.0 });
  });
});
