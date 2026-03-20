import type { GraderDefinition, GraderContext } from '../types.js';

export interface ToolNameMatchOptions {
  strict?: boolean;
}

export function toolNameMatch(opts: ToolNameMatchOptions = {}): GraderDefinition {
  const strict = opts.strict ?? false;

  return {
    name: 'tool_name_match',
    type: 'tool_name_match',
    config: opts as unknown as Record<string, unknown>,
    grade(context: GraderContext) {
      const expected = context.expectedToolCalls ?? [];
      const actual = context.actualToolCalls ?? [];

      if (expected.length === 0) {
        return {
          score: 1.0,
          name: 'tool_name_match',
          graderType: 'tool_name_match',
          reasoning: 'No expected tool calls defined',
        };
      }

      const expectedNames = new Set(expected.map((t) => t.name));
      const actualNames = new Set(actual.map((t) => t.name));

      const intersection = new Set([...expectedNames].filter((n) => actualNames.has(n)));

      if (strict) {
        // Exact set match
        const match = intersection.size === expectedNames.size && actualNames.size === expectedNames.size;
        return {
          score: match ? 1.0 : 0.0,
          name: 'tool_name_match',
          graderType: 'tool_name_match',
          reasoning: match
            ? 'Exact tool name set match'
            : `Expected: ${[...expectedNames].join(', ')}; Got: ${[...actualNames].join(', ')}`,
        };
      }

      // Partial: intersection / expected
      const score = intersection.size / expectedNames.size;
      const missing = [...expectedNames].filter((n) => !actualNames.has(n));

      return {
        score: Number(score.toFixed(4)),
        name: 'tool_name_match',
        graderType: 'tool_name_match',
        reasoning:
          missing.length === 0
            ? 'All expected tools were called'
            : `Missing tools: ${missing.join(', ')}`,
      };
    },
  };
}
