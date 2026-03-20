import type { GraderDefinition, GraderContext } from '../types.js';

export function regex(pattern: string | RegExp): GraderDefinition {
  const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  return {
    name: 'regex',
    type: 'regex',
    config: { pattern: re.source, flags: re.flags },
    grade(context: GraderContext) {
      const match = re.test(context.output);
      return {
        score: match ? 1.0 : 0.0,
        name: 'regex',
        graderType: 'regex',
        reasoning: match
          ? `Output matches pattern /${re.source}/${re.flags}`
          : `Output does not match pattern /${re.source}/${re.flags}`,
      };
    },
  };
}
