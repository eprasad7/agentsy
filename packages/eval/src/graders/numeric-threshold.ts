import type { GraderDefinition, GraderContext } from '../types.js';

export interface NumericThresholdOptions {
  operator: '>' | '>=' | '<' | '<=' | '==';
  value: number;
  extractPattern?: string;
}

export function numericThreshold(opts: NumericThresholdOptions): GraderDefinition {
  const { operator, value, extractPattern } = opts;
  const extractRe = extractPattern ? new RegExp(extractPattern) : null;

  return {
    name: 'numeric_threshold',
    type: 'numeric_threshold',
    config: opts as unknown as Record<string, unknown>,
    grade(context: GraderContext) {
      let numStr: string | undefined;

      if (extractRe) {
        const match = extractRe.exec(context.output);
        numStr = match?.[1] ?? match?.[0];
      } else {
        // Extract first number from output
        const match = /(-?\d+(?:\.\d+)?)/.exec(context.output);
        numStr = match?.[1];
      }

      if (numStr === undefined) {
        return {
          score: 0.0,
          name: 'numeric_threshold',
          graderType: 'numeric_threshold',
          reasoning: 'No number found in output',
        };
      }

      const num = parseFloat(numStr);
      if (isNaN(num)) {
        return {
          score: 0.0,
          name: 'numeric_threshold',
          graderType: 'numeric_threshold',
          reasoning: `Could not parse number from "${numStr}"`,
        };
      }

      let pass: boolean;
      switch (operator) {
        case '>':
          pass = num > value;
          break;
        case '>=':
          pass = num >= value;
          break;
        case '<':
          pass = num < value;
          break;
        case '<=':
          pass = num <= value;
          break;
        case '==':
          pass = num === value;
          break;
      }

      return {
        score: pass ? 1.0 : 0.0,
        name: 'numeric_threshold',
        graderType: 'numeric_threshold',
        reasoning: `${num} ${operator} ${value} is ${pass}`,
      };
    },
  };
}
