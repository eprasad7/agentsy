import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
} from '@temporalio/workflow';
import type { RunInput } from '@agentsy/shared';

// Activities are proxied — Temporal serializes/deserializes across the workflow boundary
const activities = proxyActivities<typeof import('../activities/index.js')>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 2,
  },
});

// ── Signals ─────────────────────────────────────────────────────────

export interface ApprovalDecision {
  decision: 'approved' | 'denied';
  resolvedBy?: string;
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
    await activities.persistRun({
      runId,
      status: 'failed',
      error: 'No agent version available',
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  const config = await activities.loadAgentConfig(versionId);

  // 3. Resolve model string (capability class → concrete model)
  const resolvedModel = resolveModelFromConfig(config.model, config.modelSpec);
  const resolvedFallback = config.fallbackModel ?? null;

  // 4. Build initial messages from input
  const messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }> = [];
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
    maxIterations?: number;
    maxTokens?: number;
    maxCostUsd?: number;
    timeoutMs?: number;
    outputValidation?: Array<{ type: string; config?: unknown }>;
  };

  const maxIterations = guardrails.maxIterations ?? 10;
  const maxTokens = guardrails.maxTokens ?? 50_000;
  const maxCostUsd = guardrails.maxCostUsd ?? 1.0;
  const timeoutMs = guardrails.timeoutMs ?? 300_000;

  // 6. Build tools map for Vercel AI SDK
  const toolsConfig = (config.toolsConfig ?? []) as Array<{
    name: string;
    type: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    riskLevel?: string;
    timeout?: number;
    approvalPolicy?: Record<string, unknown>;
  }>;

  const aiTools: Record<string, { description: string; parameters: Record<string, unknown> }> = {};
  for (const tool of toolsConfig) {
    if (tool.type === 'native' && tool.inputSchema) {
      aiTools[tool.name] = {
        description: tool.description ?? tool.name,
        parameters: tool.inputSchema,
      };
    }
  }

  // 7. Agentic loop
  while (iteration < maxIterations) {
    // Guardrail checks (before each iteration)
    if (totalTokensIn + totalTokensOut >= maxTokens) {
      await persistGuardrailViolation(runId, orgId, ++stepOrder, 'max_tokens', resolvedModel, {
        totalTokensIn, totalTokensOut, totalCost, startedAt,
      });
      return;
    }

    if (totalCost >= maxCostUsd) {
      await persistGuardrailViolation(runId, orgId, ++stepOrder, 'max_cost_usd', resolvedModel, {
        totalTokensIn, totalTokensOut, totalCost, startedAt,
      });
      return;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      await persistGuardrailViolation(runId, orgId, ++stepOrder, 'timeout', resolvedModel, {
        totalTokensIn, totalTokensOut, totalCost, startedAt,
      });
      return;
    }

    iteration++;

    // LLM call
    const llmResult = await activities.llmCall({
      model: resolvedModel,
      fallbackModel: resolvedFallback,
      systemPrompt: config.systemPrompt,
      messages: messages as Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>,
      tools: Object.keys(aiTools).length > 0 ? aiTools as Record<string, never> : undefined,
      modelParams: config.modelParams as Record<string, unknown>,
    });

    totalTokensIn += llmResult.tokensIn;
    totalTokensOut += llmResult.tokensOut;
    totalCost += llmResult.costUsd;

    // Persist LLM step
    await activities.persistRunStep({
      runId, orgId, stepOrder: ++stepOrder,
      type: 'llm_call',
      model: llmResult.model,
      tokensIn: llmResult.tokensIn,
      tokensOut: llmResult.tokensOut,
      costUsd: llmResult.costUsd,
      output: llmResult.text || undefined,
    });

    // No tool calls → final response
    if (llmResult.toolCalls.length === 0) {
      // Run output validators before completing
      const validationResult = await activities.validateOutput({
        output: llmResult.text,
        validators: guardrails.outputValidation,
      });

      if (!validationResult.passed) {
        // Persist guardrail step for output violation
        await activities.persistRunStep({
          runId, orgId, stepOrder: ++stepOrder,
          type: 'guardrail',
          output: `Output validation failed: ${validationResult.violations.map((v) => v.message).join('; ')}`,
        });

        await activities.persistRun({
          runId,
          status: 'completed',
          output: { type: 'text', text: llmResult.text },
          totalTokensIn, totalTokensOut, totalCostUsd: totalCost,
          durationMs: Date.now() - startedAt,
          model: resolvedModel,
          metadata: {
            guardrail_triggered: 'output_validation',
            violations: validationResult.violations,
          },
        });
        return;
      }

      await activities.persistRun({
        runId,
        status: 'completed',
        output: { type: 'text', text: llmResult.text },
        totalTokensIn, totalTokensOut, totalCostUsd: totalCost,
        durationMs: Date.now() - startedAt,
        model: resolvedModel,
      });
      return;
    }

    // Process tool calls
    messages.push({ role: 'assistant', content: llmResult.text || '' });

    for (const toolCall of llmResult.toolCalls) {
      const toolDef = toolsConfig.find((t) => t.name === toolCall.toolName);

      // Approval gate check
      if (toolDef) {
        const needsApproval = checkApproval(toolDef, environment);
        if (needsApproval) {
          // Persist approval request step
          await activities.persistRunStep({
            runId, orgId, stepOrder: ++stepOrder,
            type: 'approval_request',
            toolName: toolCall.toolName,
            input: JSON.stringify(toolCall.args),
            approvalStatus: 'pending',
          });

          // Set run status to awaiting_approval
          await activities.persistRun({ runId, status: 'awaiting_approval' as never });

          // Wait for approval signal
          let decision: ApprovalDecision | undefined;
          setHandler(approvalSignal, (d) => { decision = d; });
          await condition(() => decision !== undefined, '1 hour');

          // Resume run
          await activities.persistRun({ runId, status: 'running' });

          if (!decision || decision.decision === 'denied') {
            messages.push({
              role: 'tool',
              content: `Tool "${toolCall.toolName}" was denied by approval gate.`,
              toolCallId: toolCall.toolCallId,
            });
            continue;
          }
        }
      }

      // Execute tool
      const toolResult = await activities.executeNativeTool({
        toolName: toolCall.toolName,
        args: toolCall.args,
        timeout: toolDef?.timeout,
      });

      // Persist tool step
      await activities.persistRunStep({
        runId, orgId, stepOrder: ++stepOrder,
        type: 'tool_call',
        toolName: toolCall.toolName,
        input: JSON.stringify(toolCall.args),
        output: toolResult.output,
        durationMs: toolResult.durationMs,
        error: toolResult.error,
        outputTruncated: toolResult.truncated,
      });

      // Add tool result to messages for next iteration
      messages.push({
        role: 'tool',
        content: toolResult.error
          ? `Error: ${toolResult.error}`
          : toolResult.output,
        toolCallId: toolCall.toolCallId,
      });
    }
  }

  // Max iterations reached
  await persistGuardrailViolation(runId, orgId, ++stepOrder, 'max_iterations', resolvedModel, {
    totalTokensIn, totalTokensOut, totalCost, startedAt,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Resolve model from config — the model field is already resolved at version creation time. */
function resolveModelFromConfig(model: string, _modelSpec: unknown): string {
  return model;
}

/** Persist a guardrail violation and mark the run as timed out. */
async function persistGuardrailViolation(
  runId: string, orgId: string, stepOrder: number,
  reason: string, model: string,
  state: { totalTokensIn: number; totalTokensOut: number; totalCost: number; startedAt: number },
) {
  await activities.persistRunStep({
    runId, orgId, stepOrder,
    type: 'guardrail',
    output: `${reason} exceeded`,
  });
  await activities.persistRun({
    runId, status: 'timeout',
    error: `Guardrail triggered: ${reason}`,
    totalTokensIn: state.totalTokensIn,
    totalTokensOut: state.totalTokensOut,
    totalCostUsd: state.totalCost,
    durationMs: Date.now() - state.startedAt,
    model,
    metadata: { guardrail_triggered: reason },
  });
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
