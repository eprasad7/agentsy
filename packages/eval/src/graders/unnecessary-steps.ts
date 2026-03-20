import type { GraderDefinition, GraderContext } from '../types.js';

export function unnecessarySteps(): GraderDefinition {
  return {
    name: 'unnecessary_steps',
    type: 'unnecessary_steps',
    grade(context: GraderContext) {
      const expected = context.expectedTrajectory ?? [];
      const actual = context.actualSteps ?? [];

      if (actual.length === 0) {
        return {
          score: 1.0,
          name: 'unnecessary_steps',
          graderType: 'unnecessary_steps',
          reasoning: 'No actual steps to evaluate',
        };
      }

      if (expected.length === 0) {
        return {
          score: 1.0,
          name: 'unnecessary_steps',
          graderType: 'unnecessary_steps',
          reasoning: 'No expected trajectory defined',
        };
      }

      // Build set of expected tool names
      const expectedToolNames = new Set(
        expected.filter((s) => s.type === 'tool_call' && s.toolName).map((s) => s.toolName!),
      );

      // Count unnecessary tool calls (those not in expected)
      const actualToolCalls = actual.filter((s) => s.type === 'tool_call' && s.toolName);
      const unnecessaryCount = actualToolCalls.filter(
        (s) => !expectedToolNames.has(s.toolName!),
      ).length;

      const total = actualToolCalls.length;
      if (total === 0) {
        return {
          score: 1.0,
          name: 'unnecessary_steps',
          graderType: 'unnecessary_steps',
          reasoning: 'No tool calls made',
        };
      }

      const score = 1.0 - unnecessaryCount / total;

      return {
        score: Number(Math.max(0, score).toFixed(4)),
        name: 'unnecessary_steps',
        graderType: 'unnecessary_steps',
        reasoning:
          unnecessaryCount === 0
            ? 'All steps are necessary'
            : `${unnecessaryCount}/${total} tool calls were unnecessary`,
      };
    },
  };
}
