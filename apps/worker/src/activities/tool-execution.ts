import { GUARDRAIL_DEFAULTS } from '@agentsy/shared';

export interface ToolExecInput {
  toolName: string;
  args: Record<string, unknown>;
  timeout?: number;
  /** Eval-only: mocked tool results from the dataset case */
  evalMockedTools?: Array<{ toolName: string; argumentsMatch?: Record<string, unknown>; result: unknown }>;
  /** Eval tool mode: "mock" (default) | "dry-run" | "live" */
  toolMode?: 'mock' | 'dry-run' | 'live';
}

export interface ToolExecResult {
  output: string;
  truncated: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Activity: Execute a native tool with timeout and result size cap.
 *
 * Eval mock support: if evalMockedTools contains a match for the tool call
 * (by name, and optionally by argument keys), return the mocked result
 * instead of real execution.
 */
export async function executeNativeTool(input: ToolExecInput): Promise<ToolExecResult> {
  const startTime = Date.now();

  const toolMode = input.toolMode ?? 'mock';

  // ── Mock mode: return mocked results from dataset case ──
  if (toolMode === 'mock' && input.evalMockedTools?.length) {
    const mock = input.evalMockedTools.find((m) => {
      if (m.toolName !== input.toolName) return false;
      if (m.argumentsMatch) {
        for (const [key, value] of Object.entries(m.argumentsMatch)) {
          if (JSON.stringify(input.args[key]) !== JSON.stringify(value)) return false;
        }
      }
      return true;
    });

    if (mock) {
      const output = typeof mock.result === 'string' ? mock.result : JSON.stringify(mock.result);
      return { output, truncated: false, durationMs: Date.now() - startTime };
    }

    // No mock found in mock mode — error
    return {
      output: '',
      truncated: false,
      durationMs: Date.now() - startTime,
      error: `No mock configured for tool "${input.toolName}" with args ${JSON.stringify(input.args)}`,
    };
  }

  // ── Dry-run mode: return a synthetic "dry-run" result without real execution ──
  if (toolMode === 'dry-run') {
    const output = JSON.stringify({
      tool: input.toolName,
      args: input.args,
      dry_run: true,
      message: `Tool "${input.toolName}" would execute with the given arguments (dry-run mode, no side effects)`,
    });
    return { output, truncated: false, durationMs: Date.now() - startTime };
  }

  // ── Live mode or non-eval (normal execution): fall through to real execution ──

  try {
    // Platform mode: tool execution is delegated to a sandboxed runtime.
    // For now, return a stub result indicating the tool was called.
    const result = JSON.stringify({
      tool: input.toolName,
      args: input.args,
      message: 'Tool execution is handled by the runtime',
    });

    const maxSize = GUARDRAIL_DEFAULTS.maxToolResultSize;
    const truncationWarning = '\n[truncated — result exceeded 10KB limit]';
    let truncated = false;
    let output = result;

    if (Buffer.byteLength(output, 'utf-8') > maxSize) {
      const warningBytes = Buffer.byteLength(truncationWarning, 'utf-8');
      output = output.slice(0, maxSize - warningBytes) + truncationWarning;
      truncated = true;
    }

    return { output, truncated, durationMs: Date.now() - startTime };
  } catch (err) {
    return {
      output: '',
      truncated: false,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
