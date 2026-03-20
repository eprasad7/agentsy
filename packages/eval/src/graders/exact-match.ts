import type { GraderDefinition, GraderContext } from '../types.js';

export interface ExactMatchOptions {
  caseSensitive?: boolean;
  trim?: boolean;
}

export function exactMatch(opts: ExactMatchOptions = {}): GraderDefinition {
  const caseSensitive = opts.caseSensitive ?? true;
  const trim = opts.trim ?? true;

  return {
    name: 'exact_match',
    type: 'exact_match',
    config: opts as unknown as Record<string, unknown>,
    grade(context: GraderContext) {
      const expected = resolveExpectedString(context.expectedOutput);
      if (expected === undefined) {
        return { score: 0, name: 'exact_match', graderType: 'exact_match', reasoning: 'No expected output provided' };
      }

      let actual = context.output;
      let exp = expected;

      if (trim) {
        actual = actual.trim();
        exp = exp.trim();
      }

      if (!caseSensitive) {
        actual = actual.toLowerCase();
        exp = exp.toLowerCase();
      }

      const match = actual === exp;
      return {
        score: match ? 1.0 : 0.0,
        name: 'exact_match',
        graderType: 'exact_match',
        reasoning: match ? 'Output matches expected' : 'Output does not match expected',
      };
    },
  };
}

function resolveExpectedString(expected: GraderContext['expectedOutput']): string | undefined {
  if (expected === undefined || expected === null) return undefined;
  if (typeof expected === 'string') return expected;
  if ('text' in expected && expected.type === 'text') return expected.text;
  return JSON.stringify(expected);
}
