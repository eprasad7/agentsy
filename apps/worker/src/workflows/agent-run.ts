import type { RunInput } from '@agentsy/shared';
import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
} from '@temporalio/workflow';

const activities = proxyActivities<typeof import('../activities/index.js')>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 2 },
});

// ── Signals ─────────────────────────────────────────────────────────

export interface ApprovalDecision {
  decision: 'approved' | 'denied';
  resolvedBy?: string;
  reason?: string;
}

const approvalSignal = defineSignal<[ApprovalDecision]>('approval');

// ── Workflow Input ──────────────────────────────────────────────────

export interface AgentRunInput {
  runId: string;
  agentId: string;
  versionId: string | null;
  orgId: string;
  input: RunInput;
  sessionId?: string;
  environment: 'development' | 'staging' | 'production';
  environmentId: string;
}

// ── Main Workflow ───────────────────────────────────────────────────

export async function AgentRunWorkflow(input: AgentRunInput): Promise<void> {
  const { runId, orgId, versionId, environment } = input;
  const startedAt = Date.now();
  let stepOrder = 0;

  // 1. Mark run as running
  await activities.persistRun({ runId, status: 'running' });

  // 2. Load agent config
  if (!versionId) {
    await activities.emitRunEvent(runId, {
      type: 'run.failed', run_id: runId,
      error: 'No agent version available', error_type: 'internal_error',
      total_tokens_in: 0, total_tokens_out: 0, total_cost_usd: 0,
      duration_ms: Date.now() - startedAt, failed_step_id: null,
    });
    await activities.persistRun({ runId, status: 'failed', error: 'No agent version available', durationMs: Date.now() - startedAt });
    return;
  }

  const config = await activities.loadAgentConfig(versionId);
  const resolvedModel = config.model;

  // 3. Emit run.started
  await activities.emitRunEvent(runId, {
    type: 'run.started',
    run_id: runId,
    agent_id: input.agentId,
    version_id: versionId,
    session_id: input.sessionId ?? null,
    model: resolvedModel,
  });

  // 4. Build messages (load session history if applicable)
  const messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }> = [];

  // Load session history for multi-turn
  const sessionMaxMessages = (config.guardrailsConfig as Record<string, unknown>)?.['sessionMaxMessages'] as number | undefined ?? 20;
  if (input.sessionId) {
    const history = await activities.loadSessionHistory(input.sessionId, sessionMaxMessages);
    for (const msg of history) {
      messages.push(msg);
    }
  }

  // Add current input
  const userInputText = extractInputText(input.input);
  if (input.input.type === 'text') {
    messages.push({ role: 'user', content: input.input.text });
  } else if (input.input.type === 'messages') {
    for (const msg of input.input.messages) {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  } else {
    messages.push({ role: 'user', content: JSON.stringify(input.input.data) });
  }

  // 5. Guardrail state
  let iteration = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;

  const guardrails = config.guardrailsConfig as {
    maxIterations?: number; maxTokens?: number; maxCostUsd?: number;
    timeoutMs?: number; outputValidation?: Array<{ type: string; config?: unknown }>;
  };

  const maxIterations = guardrails.maxIterations ?? 10;
  const maxTokens = guardrails.maxTokens ?? 50_000;
  const maxCostUsd = guardrails.maxCostUsd ?? 1.0;
  const timeoutMs = guardrails.timeoutMs ?? 300_000;

  // 6. Output config (response contract)
  const outputConfig = (config.outputConfig ?? { mode: 'text' }) as {
    mode: 'text' | 'json'; json_schema?: Record<string, unknown>; strict?: boolean;
  };
  const isJsonMode = outputConfig.mode === 'json';

  // 7. Build tools map
  const toolsConfig = (config.toolsConfig ?? []) as Array<{
    name: string; type: string; description?: string; inputSchema?: Record<string, unknown>;
    riskLevel?: string; timeout?: number; approvalPolicy?: Record<string, unknown>;
  }>;

  const aiTools: Record<string, { description: string; parameters: Record<string, unknown> }> = {};
  for (const tool of toolsConfig) {
    if (tool.type === 'native' && tool.inputSchema) {
      aiTools[tool.name] = { description: tool.description ?? tool.name, parameters: tool.inputSchema };
    }
  }

  // 7. Agentic loop
  let lastOutputText = '';
  while (iteration < maxIterations) {
    // Guardrail checks
    const guardrailViolation = checkGuardrails({
      iteration, totalTokensIn, totalTokensOut, totalCost, startedAt,
      maxIterations, maxTokens, maxCostUsd, timeoutMs,
    });
    if (guardrailViolation) {
      await emitGuardrailViolation(runId, orgId, ++stepOrder, guardrailViolation, resolvedModel, {
        totalTokensIn, totalTokensOut, totalCost, startedAt,
      });
      return;
    }

    iteration++;

    // Generate step ID upfront so streaming events and persistence use the same ID
    const llmStepId = await activities.generateStepId();
    const nextStepOrder = ++stepOrder;

    // Emit step.thinking
    await activities.emitRunEvent(runId, {
      type: 'step.thinking', step_id: llmStepId, step_order: nextStepOrder, model: resolvedModel,
    });

    // LLM call (streaming — emits step.text_delta events internally using llmStepId)
    const llmStepStart = Date.now();
    const llmResult = await activities.llmCall({
      model: resolvedModel,
      fallbackModel: config.fallbackModel,
      systemPrompt: config.systemPrompt,
      messages: messages as Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>,
      tools: Object.keys(aiTools).length > 0 ? aiTools as Record<string, never> : undefined,
      modelParams: config.modelParams as Record<string, unknown>,
      outputMode: isJsonMode ? 'json' : 'text',
      runId,
      stepId: llmStepId,
    });

    totalTokensIn += llmResult.tokensIn;
    totalTokensOut += llmResult.tokensOut;
    totalCost += llmResult.costUsd;

    // Persist with the same step ID used for streaming
    await activities.persistRunStep({
      id: llmStepId,
      runId, orgId, stepOrder: nextStepOrder,
      type: 'llm_call', model: llmResult.model,
      tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut, costUsd: llmResult.costUsd,
      output: llmResult.text || undefined, durationMs: Date.now() - llmStepStart,
    });

    await activities.emitRunEvent(runId, {
      type: 'step.completed', step_id: llmStepId, step_order: nextStepOrder,
      step_type: 'llm_call', tokens_in: llmResult.tokensIn, tokens_out: llmResult.tokensOut,
      cost_usd: llmResult.costUsd, duration_ms: Date.now() - llmStepStart,
    });

    lastOutputText = llmResult.text;

    // No tool calls → final response
    if (llmResult.toolCalls.length === 0) {
      // Run output validators (guardrails)
      const validationResult = await activities.validateOutput({
        output: llmResult.text, validators: guardrails.outputValidation,
      });

      if (!validationResult.passed) {
        const gStepId = await activities.persistRunStep({
          runId, orgId, stepOrder: ++stepOrder, type: 'guardrail',
          output: `Output validation failed: ${validationResult.violations.map((v) => v.message).join('; ')}`,
        });
        for (const v of validationResult.violations) {
          await activities.emitRunEvent(runId, {
            type: 'step.guardrail', step_id: gStepId, step_order: stepOrder,
            guardrail_type: v.type, passed: false, message: v.message,
          });
        }
        await completeRun(runId, llmResult.text, resolvedModel, {
          totalTokensIn, totalTokensOut, totalCost, startedAt,
          metadata: { guardrail_triggered: 'output_validation', violations: validationResult.violations },
        });
      } else {
        // JSON mode: parse + validate against schema
        let outputValid: boolean | null = null;
        let outputValidation: { ok: boolean; errors?: Array<{ path: string; message: string }> } | null = null;
        let parsedOutput: unknown = null;

        if (isJsonMode) {
          const jsonResult = validateJsonOutput(llmResult.text, outputConfig.json_schema);
          outputValid = jsonResult.ok;
          outputValidation = jsonResult;
          parsedOutput = jsonResult.parsed;

          if (!jsonResult.ok && outputConfig.strict) {
            // strict: true → fail the run
            const errorMsg = `JSON output validation failed: ${(jsonResult.errors ?? []).map((e) => e.message).join('; ')}`;
            await activities.emitRunEvent(runId, {
              type: 'run.failed', run_id: runId, error: errorMsg,
              error_type: 'output_validation_failed',
              total_tokens_in: totalTokensIn, total_tokens_out: totalTokensOut,
              total_cost_usd: totalCost, duration_ms: Date.now() - startedAt, failed_step_id: null,
            });
            await activities.persistRun({
              runId, status: 'failed', error: errorMsg,
              output: { type: 'text', text: llmResult.text },
              totalTokensIn, totalTokensOut, totalCostUsd: totalCost,
              durationMs: Date.now() - startedAt, model: resolvedModel,
              outputValid: false, outputValidation: jsonResult,
            });
            await activities.cleanupRunEvents(runId);

            if (input.sessionId) {
              await activities.persistMessages({
                sessionId: input.sessionId, orgId, runId,
                userMessage: userInputText, agentMessage: llmResult.text,
              });
            }
            return;
          }
        }

        // Build output based on mode
        const runOutput = isJsonMode && parsedOutput !== null
          ? { type: 'structured' as const, data: parsedOutput as Record<string, unknown> }
          : { type: 'text' as const, text: llmResult.text };

        await completeRun(runId, llmResult.text, resolvedModel, {
          totalTokensIn, totalTokensOut, totalCost, startedAt,
          outputValid, outputValidation, runOutput,
        });
      }

      // Persist session messages if session-scoped
      if (input.sessionId) {
        await activities.persistMessages({
          sessionId: input.sessionId, orgId, runId,
          userMessage: userInputText, agentMessage: llmResult.text,
        });
      }

      await activities.cleanupRunEvents(runId);
      return;
    }

    // Process tool calls
    messages.push({ role: 'assistant', content: llmResult.text || '' });

    for (const toolCall of llmResult.toolCalls) {
      const toolDef = toolsConfig.find((t) => t.name === toolCall.toolName);

      // Generate tool step ID upfront
      const toolStepId = await activities.generateStepId();
      const toolStepOrder = ++stepOrder;

      // Emit step.tool_call with the real step ID
      await activities.emitRunEvent(runId, {
        type: 'step.tool_call', step_id: toolStepId, step_order: toolStepOrder,
        tool_name: toolCall.toolName, tool_call_id: toolCall.toolCallId, arguments: toolCall.args,
      });

      // Approval gate
      if (toolDef && checkApproval(toolDef, environment)) {
        const approvalStepId = await activities.generateStepId();
        await activities.persistRunStep({
          id: approvalStepId,
          runId, orgId, stepOrder: ++stepOrder, type: 'approval_request',
          toolName: toolCall.toolName, input: JSON.stringify(toolCall.args), approvalStatus: 'pending',
        });

        await activities.emitRunEvent(runId, {
          type: 'step.approval_requested', step_id: approvalStepId, step_order: stepOrder,
          tool_name: toolCall.toolName, tool_call_id: toolCall.toolCallId,
          arguments: toolCall.args, risk_level: (toolDef.riskLevel as 'write' | 'admin') ?? 'write',
        });

        await activities.persistRun({ runId, status: 'awaiting_approval' as never });

        let decision: ApprovalDecision | undefined;
        setHandler(approvalSignal, (d) => { decision = d; });
        await condition(() => decision !== undefined, '1 hour');

        await activities.persistRun({ runId, status: 'running' });

        await activities.emitRunEvent(runId, {
          type: 'step.approval_resolved', step_id: approvalStepId,
          tool_name: toolCall.toolName, tool_call_id: toolCall.toolCallId,
          approved: decision?.decision === 'approved',
          resolved_by: decision?.resolvedBy ?? null, reason: decision?.reason,
        });

        if (!decision || decision.decision === 'denied') {
          messages.push({ role: 'tool', content: `Tool "${toolCall.toolName}" was denied.`, toolCallId: toolCall.toolCallId });
          continue;
        }
      }

      // Execute tool
      const toolStart = Date.now();
      const toolResult = await activities.executeNativeTool({
        toolName: toolCall.toolName, args: toolCall.args, timeout: toolDef?.timeout,
      });

      // Emit step.tool_result with the same step ID
      await activities.emitRunEvent(runId, {
        type: 'step.tool_result', step_id: toolStepId,
        tool_name: toolCall.toolName, tool_call_id: toolCall.toolCallId,
        result: toolResult.output, duration_ms: toolResult.durationMs, error: toolResult.error ?? null,
      });

      // Persist tool step with the pre-generated ID
      await activities.persistRunStep({
        id: toolStepId,
        runId, orgId, stepOrder: toolStepOrder, type: 'tool_call', toolName: toolCall.toolName,
        input: JSON.stringify(toolCall.args), output: toolResult.output,
        durationMs: toolResult.durationMs, error: toolResult.error, outputTruncated: toolResult.truncated,
      });

      await activities.emitRunEvent(runId, {
        type: 'step.completed', step_id: toolStepId, step_order: toolStepOrder,
        step_type: 'tool_call', tokens_in: 0, tokens_out: 0, cost_usd: 0, duration_ms: Date.now() - toolStart,
      });

      messages.push({
        role: 'tool',
        content: toolResult.error ? `Error: ${toolResult.error}` : toolResult.output,
        toolCallId: toolCall.toolCallId,
      });
    }
  }

  // Max iterations
  await emitGuardrailViolation(runId, orgId, ++stepOrder, 'max_iterations', resolvedModel, {
    totalTokensIn, totalTokensOut, totalCost, startedAt,
  });

  // Still persist session messages with last output
  if (input.sessionId && lastOutputText) {
    await activities.persistMessages({
      sessionId: input.sessionId, orgId, runId,
      userMessage: userInputText, agentMessage: lastOutputText,
    });
  }

  await activities.cleanupRunEvents(runId);
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractInputText(input: RunInput): string {
  if (input.type === 'text') return input.text;
  if (input.type === 'messages') return input.messages[input.messages.length - 1]?.content ?? '';
  return JSON.stringify(input.data);
}

function checkGuardrails(state: {
  iteration: number; totalTokensIn: number; totalTokensOut: number;
  totalCost: number; startedAt: number;
  maxIterations: number; maxTokens: number; maxCostUsd: number; timeoutMs: number;
}): string | null {
  if (state.totalTokensIn + state.totalTokensOut >= state.maxTokens) return 'max_tokens';
  if (state.totalCost >= state.maxCostUsd) return 'max_cost';
  if (Date.now() - state.startedAt >= state.timeoutMs) return 'timeout';
  return null;
}

async function emitGuardrailViolation(
  runId: string, orgId: string, stepOrder: number, reason: string, model: string,
  state: { totalTokensIn: number; totalTokensOut: number; totalCost: number; startedAt: number },
) {
  await activities.persistRunStep({ runId, orgId, stepOrder, type: 'guardrail', output: `${reason} exceeded` });
  await activities.emitRunEvent(runId, {
    type: 'run.failed', run_id: runId, error: `Guardrail triggered: ${reason}`,
    error_type: reason, total_tokens_in: state.totalTokensIn, total_tokens_out: state.totalTokensOut,
    total_cost_usd: state.totalCost, duration_ms: Date.now() - state.startedAt, failed_step_id: null,
  });
  await activities.persistRun({
    runId, status: 'timeout', error: `Guardrail triggered: ${reason}`,
    totalTokensIn: state.totalTokensIn, totalTokensOut: state.totalTokensOut,
    totalCostUsd: state.totalCost, durationMs: Date.now() - state.startedAt, model,
    metadata: { guardrail_triggered: reason },
  });
  await activities.cleanupRunEvents(runId);
}

async function completeRun(
  runId: string, text: string, model: string,
  state: {
    totalTokensIn: number; totalTokensOut: number; totalCost: number; startedAt: number;
    metadata?: Record<string, unknown>;
    outputValid?: boolean | null;
    outputValidation?: { ok: boolean; errors?: Array<{ path: string; message: string }> } | null;
    runOutput?: { type: 'text'; text: string } | { type: 'structured'; data: Record<string, unknown> };
  },
) {
  const output = state.runOutput ?? { type: 'text' as const, text };

  await activities.emitRunEvent(runId, {
    type: 'run.completed', run_id: runId, output,
    total_tokens_in: state.totalTokensIn, total_tokens_out: state.totalTokensOut,
    total_cost_usd: state.totalCost, duration_ms: Date.now() - state.startedAt, trace_id: null,
  });
  await activities.persistRun({
    runId, status: 'completed', output,
    totalTokensIn: state.totalTokensIn, totalTokensOut: state.totalTokensOut,
    totalCostUsd: state.totalCost, durationMs: Date.now() - state.startedAt, model,
    outputValid: state.outputValid ?? null,
    outputValidation: state.outputValidation ?? null,
    metadata: state.metadata,
  });
}

function validateJsonOutput(
  text: string,
  schema?: Record<string, unknown>,
): { ok: boolean; parsed?: unknown; errors?: Array<{ path: string; message: string }> } {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      errors: [{ path: '', message: `Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}` }],
    };
  }

  // Step 2: Validate against schema (if provided)
  if (schema) {
    const errors = validateAgainstSchema(parsed, schema, '');
    if (errors.length > 0) {
      return { ok: false, parsed, errors };
    }
  }

  return { ok: true, parsed };
}

function validateAgainstSchema(
  value: unknown, schema: Record<string, unknown>, path: string,
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const type = schema['type'] as string | undefined;

  if (type) {
    const actualType = getJsonType(value);
    if (type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push({ path: path || '$', message: `expected integer, got ${actualType}` });
        return errors;
      }
    } else if (actualType !== type) {
      errors.push({ path: path || '$', message: `expected ${type}, got ${actualType}` });
      return errors;
    }
  }

  if (type === 'object' || (!type && typeof value === 'object' && value !== null && !Array.isArray(value))) {
    const obj = value as Record<string, unknown>;
    const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
    const required = schema['required'] as string[] | undefined;

    if (required) {
      for (const key of required) {
        if (!(key in obj)) {
          errors.push({ path: `${path}.${key}`, message: `missing required property "${key}"` });
        }
      }
    }

    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          errors.push(...validateAgainstSchema(obj[key], propSchema, `${path}.${key}`));
        }
      }
    }
  }

  if (type === 'array' && Array.isArray(value)) {
    const items = schema['items'] as Record<string, unknown> | undefined;
    if (items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateAgainstSchema(value[i], items, `${path}[${i}]`));
      }
    }
  }

  const enumValues = schema['enum'] as unknown[] | undefined;
  if (enumValues && !enumValues.includes(value)) {
    errors.push({ path: path || '$', message: `value not in enum` });
  }

  return errors;
}

function getJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkApproval(
  toolDef: { riskLevel?: string; approvalPolicy?: Record<string, unknown> },
  environment: string,
): boolean {
  const policy = toolDef.approvalPolicy;
  const riskLevel = toolDef.riskLevel ?? 'read';
  if (policy?.['autoApprove']) return false;
  if (policy?.['requireApproval']) return true;
  const envList = policy?.['requireApprovalIn'] as string[] | undefined;
  if (envList?.includes(environment)) return true;
  switch (riskLevel) {
    case 'read': return false;
    case 'write': return environment === 'production';
    case 'admin': return true;
    default: return false;
  }
}
