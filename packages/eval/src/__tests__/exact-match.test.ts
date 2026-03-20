import { describe, it, expect } from 'vitest';

import { exactMatch } from '../graders/exact-match.js';
import type { GraderContext } from '../types.js';

function ctx(output: string, expected?: string): GraderContext {
  return {
    input: 'test input',
    output,
    expectedOutput: expected,
  };
}

describe('exactMatch', () => {
  it('scores 1.0 for exact match', () => {
    const grader = exactMatch();
    const result = grader.grade(ctx('hello world', 'hello world'));
    expect(result).toMatchObject({ score: 1.0, graderType: 'exact_match' });
  });

  it('scores 0.0 for mismatch', () => {
    const grader = exactMatch();
    const result = grader.grade(ctx('hello', 'world'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('trims whitespace by default', () => {
    const grader = exactMatch();
    const result = grader.grade(ctx('  hello  ', 'hello'));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('respects trim=false', () => {
    const grader = exactMatch({ trim: false });
    const result = grader.grade(ctx('  hello  ', 'hello'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('is case-sensitive by default', () => {
    const grader = exactMatch();
    const result = grader.grade(ctx('Hello', 'hello'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('supports case-insensitive mode', () => {
    const grader = exactMatch({ caseSensitive: false });
    const result = grader.grade(ctx('Hello World', 'hello world'));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('scores 0 when no expected output', () => {
    const grader = exactMatch();
    const result = grader.grade(ctx('hello'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('handles RunOutput type expected', () => {
    const grader = exactMatch();
    const result = grader.grade({
      input: 'test',
      output: 'hello',
      expectedOutput: { type: 'text', text: 'hello' },
    });
    expect(result).toMatchObject({ score: 1.0 });
  });
});
