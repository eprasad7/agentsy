import { GUARDRAIL_DEFAULTS } from '@agentsy/shared';

export interface ToolExecInput {
  toolName: string;
  args: Record<string, unknown>;
  timeout?: number;
}

export interface ToolExecResult {
  output: string;
  truncated: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Activity: Execute a native tool with timeout and result size cap.
 * In platform mode, the actual tool function is loaded from the agent config.
 * This activity is a placeholder — real execution happens via the tool registry.
 */
export async function executeNativeTool(input: ToolExecInput): Promise<ToolExecResult> {
  const startTime = Date.now();
  // timeout used for future sandbox execution
  void (input.timeout ?? GUARDRAIL_DEFAULTS.toolTimeout);

  try {
    // In platform mode, tool execution is delegated to a sandboxed runtime.
    // For now, return a stub result indicating the tool was called.
    const result = JSON.stringify({
      tool: input.toolName,
      args: input.args,
      message: 'Tool execution is handled by the runtime',
    });

    const maxSize = GUARDRAIL_DEFAULTS.maxToolResultSize;
    let truncated = false;
    let output = result;

    if (Buffer.byteLength(output, 'utf-8') > maxSize) {
      output = output.slice(0, maxSize) + '\n[truncated — result exceeded 10KB limit]';
      truncated = true;
    }

    return {
      output,
      truncated,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      output: '',
      truncated: false,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
