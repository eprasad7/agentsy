import type { GraderDefinition, GraderContext } from '../types.js';

export interface ToolSequenceOptions {
  allowExtraCalls?: boolean;
}

export function toolSequence(opts: ToolSequenceOptions = {}): GraderDefinition {
  const allowExtraCalls = opts.allowExtraCalls ?? true;

  return {
    name: 'tool_sequence',
    type: 'tool_sequence',
    config: opts as unknown as Record<string, unknown>,
    grade(context: GraderContext) {
      const expected = context.expectedTrajectory ?? [];
      const actual = context.actualSteps ?? [];

      if (expected.length === 0) {
        return {
          score: 1.0,
          name: 'tool_sequence',
          graderType: 'tool_sequence',
          reasoning: 'No expected trajectory defined',
        };
      }

      // Extract tool call names from actual steps
      const actualToolNames = actual
        .filter((s) => s.type === 'tool_call' && s.toolName)
        .map((s) => s.toolName!);

      // Extract expected tool names (for tool_call trajectory steps)
      const expectedToolNames = expected
        .filter((s) => s.type === 'tool_call' && s.toolName)
        .map((s) => s.toolName!);

      if (expectedToolNames.length === 0) {
        return {
          score: 1.0,
          name: 'tool_sequence',
          graderType: 'tool_sequence',
          reasoning: 'No tool_call steps in expected trajectory',
        };
      }

      // Compute longest common subsequence
      const lcsLen = longestCommonSubsequence(expectedToolNames, actualToolNames);
      const score = lcsLen / expectedToolNames.length;

      if (!allowExtraCalls && actualToolNames.length > expectedToolNames.length) {
        // Penalize for extra calls
        const penalty = (actualToolNames.length - expectedToolNames.length) / actualToolNames.length;
        const adjustedScore = Math.max(0, score - penalty * 0.5);
        return {
          score: Number(adjustedScore.toFixed(4)),
          name: 'tool_sequence',
          graderType: 'tool_sequence',
          reasoning: `LCS: ${lcsLen}/${expectedToolNames.length}, extra calls penalized`,
        };
      }

      return {
        score: Number(score.toFixed(4)),
        name: 'tool_sequence',
        graderType: 'tool_sequence',
        reasoning: `LCS: ${lcsLen}/${expectedToolNames.length} expected tool calls in order`,
      };
    },
  };
}

function longestCommonSubsequence(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  return dp[m]![n]!;
}
