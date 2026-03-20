import { describe, it, expect } from 'vitest';

import { numericThreshold } from '../graders/numeric-threshold.js';
import type { GraderContext } from '../types.js';

function ctx(output: string): GraderContext {
  return { input: 'test', output };
}

describe('numericThreshold', () => {
  it('passes > operator', () => {
    const grader = numericThreshold({ operator: '>', value: 5 });
    expect(grader.grade(ctx('The result is 10'))).toMatchObject({ score: 1.0 });
    expect(grader.grade(ctx('The result is 3'))).toMatchObject({ score: 0.0 });
  });

  it('passes >= operator', () => {
    const grader = numericThreshold({ operator: '>=', value: 5 });
    expect(grader.grade(ctx('5'))).toMatchObject({ score: 1.0 });
    expect(grader.grade(ctx('4.9'))).toMatchObject({ score: 0.0 });
  });

  it('passes < operator', () => {
    const grader = numericThreshold({ operator: '<', value: 10 });
    expect(grader.grade(ctx('Result: 5'))).toMatchObject({ score: 1.0 });
    expect(grader.grade(ctx('Result: 15'))).toMatchObject({ score: 0.0 });
  });

  it('passes == operator', () => {
    const grader = numericThreshold({ operator: '==', value: 42 });
    expect(grader.grade(ctx('42'))).toMatchObject({ score: 1.0 });
    expect(grader.grade(ctx('43'))).toMatchObject({ score: 0.0 });
  });

  it('uses extractPattern', () => {
    const grader = numericThreshold({
      operator: '>',
      value: 50,
      extractPattern: 'accuracy:\\s*(\\d+(?:\\.\\d+)?)',
    });
    expect(grader.grade(ctx('accuracy: 95.5'))).toMatchObject({ score: 1.0 });
    expect(grader.grade(ctx('accuracy: 30'))).toMatchObject({ score: 0.0 });
  });

  it('scores 0 when no number found', () => {
    const grader = numericThreshold({ operator: '>', value: 0 });
    expect(grader.grade(ctx('no numbers here'))).toMatchObject({ score: 0.0 });
  });

  it('handles negative numbers', () => {
    const grader = numericThreshold({ operator: '<', value: 0 });
    expect(grader.grade(ctx('-5'))).toMatchObject({ score: 1.0 });
  });

  it('handles decimals', () => {
    const grader = numericThreshold({ operator: '>=', value: 0.95 });
    expect(grader.grade(ctx('Score: 0.97'))).toMatchObject({ score: 1.0 });
  });
});
