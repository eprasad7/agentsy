import { describe, it, expect } from 'vitest';

import { toolSequence } from '../graders/tool-sequence.js';
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

describe('toolSequence', () => {
  it('scores 1.0 for exact sequence match', () => {
    const grader = toolSequence();
    const result = grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'b' }, { type: 'tool_call', toolName: 'c' }],
      [{ type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'b' }, { type: 'tool_call', toolName: 'c' }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores based on LCS for reordered calls', async () => {
    const grader = toolSequence();
    const result = await grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'b' }, { type: 'tool_call', toolName: 'c' }],
      [{ type: 'tool_call', toolName: 'c' }, { type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'b' }],
    ));
    // LCS of [a,b,c] and [c,a,b] = [a,b] length 2, score = 2/3
    expect(result.score).toBeCloseTo(2 / 3, 2);
  });

  it('allows extra calls between expected (default)', () => {
    const grader = toolSequence();
    const result = grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'c' }],
      [{ type: 'tool_call', toolName: 'a' }, { type: 'tool_call', toolName: 'b' }, { type: 'tool_call', toolName: 'c' }],
    ));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores 1.0 with no expected trajectory', () => {
    const grader = toolSequence();
    const result = grader.grade(ctx([], [{ type: 'tool_call', toolName: 'a' }]));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores 0 when no expected tools found in actual', () => {
    const grader = toolSequence();
    const result = grader.grade(ctx(
      [{ type: 'tool_call', toolName: 'a' }],
      [{ type: 'tool_call', toolName: 'x' }, { type: 'tool_call', toolName: 'y' }],
    ));
    expect(result).toMatchObject({ score: 0.0 });
  });
});
