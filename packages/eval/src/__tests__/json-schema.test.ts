import { describe, it, expect } from 'vitest';

import { jsonSchemaGrader } from '../graders/json-schema.js';
import type { GraderContext } from '../types.js';

function ctx(output: string): GraderContext {
  return { input: 'test', output };
}

describe('jsonSchemaGrader', () => {
  it('scores 1.0 for valid JSON matching schema', () => {
    const grader = jsonSchemaGrader({
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name'],
    });
    const result = grader.grade(ctx('{"name": "Alice", "age": 30}'));
    expect(result).toMatchObject({ score: 1.0, graderType: 'json_schema' });
  });

  it('scores 0.0 for invalid JSON', () => {
    const grader = jsonSchemaGrader({ type: 'object' });
    const result = grader.grade(ctx('not json'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('scores 0.0 for missing required field', () => {
    const grader = jsonSchemaGrader({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    const result = grader.grade(ctx('{"age": 30}'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('scores 0.0 for wrong type', () => {
    const grader = jsonSchemaGrader({ type: 'string' });
    const result = grader.grade(ctx('42'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('validates array items', () => {
    const grader = jsonSchemaGrader({
      type: 'array',
      items: { type: 'number' },
    });
    const result = grader.grade(ctx('[1, 2, 3]'));
    expect(result).toMatchObject({ score: 1.0 });
  });

  it('validates array with wrong item type', () => {
    const grader = jsonSchemaGrader({
      type: 'array',
      items: { type: 'number' },
    });
    const result = grader.grade(ctx('[1, "two", 3]'));
    expect(result).toMatchObject({ score: 0.0 });
  });

  it('validates enum', () => {
    const grader = jsonSchemaGrader({ enum: ['a', 'b', 'c'] });
    expect(grader.grade(ctx('"a"'))).toMatchObject({ score: 1.0 });
    expect(grader.grade(ctx('"d"'))).toMatchObject({ score: 0.0 });
  });
});
