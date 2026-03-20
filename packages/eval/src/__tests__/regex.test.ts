import { describe, it, expect } from 'vitest';

import { regex } from '../graders/regex.js';
import type { GraderContext } from '../types.js';

function ctx(output: string): GraderContext {
  return { input: 'test', output };
}

describe('regex', () => {
  it('scores 1.0 for matching pattern (string)', () => {
    const grader = regex('hello\\s+world');
    expect(grader.grade(ctx('hello   world'))).toMatchObject({ score: 1.0 });
  });

  it('scores 0.0 for non-matching pattern', () => {
    const grader = regex('^exact$');
    expect(grader.grade(ctx('not exact match'))).toMatchObject({ score: 0.0 });
  });

  it('accepts RegExp object', () => {
    const grader = regex(/\d{3}-\d{4}/);
    expect(grader.grade(ctx('Call 555-1234'))).toMatchObject({ score: 1.0 });
  });

  it('supports regex flags', () => {
    const grader = regex(/hello/i);
    expect(grader.grade(ctx('HELLO'))).toMatchObject({ score: 1.0 });
  });

  it('scores 0.0 for empty output', () => {
    const grader = regex('something');
    expect(grader.grade(ctx(''))).toMatchObject({ score: 0.0 });
  });
});
