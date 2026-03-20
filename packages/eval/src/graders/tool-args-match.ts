import type { GraderDefinition, GraderContext } from '../types.js';

export function toolArgsMatch(): GraderDefinition {
  return {
    name: 'tool_args_match',
    type: 'tool_args_match',
    grade(context: GraderContext) {
      const expected = context.expectedToolCalls ?? [];
      const actual = context.actualToolCalls ?? [];

      if (expected.length === 0) {
        return {
          score: 1.0,
          name: 'tool_args_match',
          graderType: 'tool_args_match',
          reasoning: 'No expected tool calls defined',
        };
      }

      let matched = 0;
      const details: string[] = [];

      for (const exp of expected) {
        // Find matching actual call by name
        const actualCall = actual.find((a) => a.name === exp.name);
        if (!actualCall) {
          details.push(`${exp.name}: not called`);
          continue;
        }

        if (!exp.arguments) {
          // No expected args — match by name alone
          matched++;
          continue;
        }

        // Partial match: all expected keys must be present with matching values
        const actualArgs = actualCall.arguments ?? {};
        let allMatch = true;

        for (const [key, expectedValue] of Object.entries(exp.arguments)) {
          const actualValue = actualArgs[key];
          if (!deepEqual(actualValue, expectedValue)) {
            allMatch = false;
            details.push(`${exp.name}.${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
          }
        }

        if (allMatch) matched++;
      }

      const score = matched / expected.length;

      return {
        score: Number(score.toFixed(4)),
        name: 'tool_args_match',
        graderType: 'tool_args_match',
        reasoning:
          details.length === 0
            ? 'All tool arguments match'
            : `Mismatches: ${details.join('; ')}`,
      };
    },
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, i) => deepEqual(val, b[i]));
    }
    if (Array.isArray(a) || Array.isArray(b)) return false;

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = Object.keys(aObj);
    if (keys.length !== Object.keys(bObj).length) return false;
    return keys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}
