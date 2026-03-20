import { generateText, jsonSchema } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { estimateCost, GUARDRAIL_DEFAULTS } from '@agentsy/shared';
import type { AgentConfig, NativeToolDefinition, ToolContext } from '@agentsy/sdk';
import { zodToJsonSchema } from '@agentsy/sdk';

export interface RunResult {
  output: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  steps: RunStep[];
}

export interface RunStep {
  type: 'llm_call' | 'tool_call';
  model?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

/**
 * In-process agentic loop — same logic as the Temporal AgentRunWorkflow
 * but using async/await instead of activities.
 */
export async function runAgent(config: AgentConfig, input: string): Promise<RunResult> {
  const startTime = Date.now();
  const steps: RunStep[] = [];

  const guardrails = config.guardrails ?? {};
  const maxIterations = guardrails.maxIterations ?? GUARDRAIL_DEFAULTS.maxIterations;
  const maxTokens = guardrails.maxTokens ?? GUARDRAIL_DEFAULTS.maxTokens;
  const maxCostUsd = guardrails.maxCostUsd ?? 1.0;
  const timeoutMs = guardrails.timeoutMs ?? GUARDRAIL_DEFAULTS.timeoutMs;

  // Resolve model
  const model = typeof config.model === 'string' ? config.model : 'claude-sonnet-4';

  // Create AI SDK model
  const aiModel = createAiModel(model);

  // Build tool definitions
  const nativeTools = (config.tools ?? []).filter(
    (t): t is NativeToolDefinition => t.type === 'native',
  );

  const toolDefs: Record<string, unknown> = {};
  const toolFns: Record<string, NativeToolDefinition['execute']> = {};

  for (const tool of nativeTools) {
    const schema = zodToJsonSchema(tool.input);
    toolDefs[tool.name] = {
      description: tool.description,
      parameters: jsonSchema(schema),
    };
    toolFns[tool.name] = tool.execute;
  }

  // Build messages
  const systemPrompt = typeof config.systemPrompt === 'string'
    ? config.systemPrompt
    : await config.systemPrompt({
        currentDate: new Date().toISOString(),
        agentName: config.name ?? config.slug,
        environment: 'development',
      });

  const messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }> = [
    { role: 'user', content: input },
  ];

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;

  // Create tool context for execute functions
  const toolContext: ToolContext = {
    getSecret: async () => { throw new Error('Secrets not available in local dev'); },
    runId: `local_${Date.now()}`,
    agentId: config.slug,
    orgId: 'local',
    environment: 'development',
    fetch: globalThis.fetch,
    log: (level, message, data) => {
      console.log(`[${level}] ${message}`, data ?? '');
    },
  };

  // Agentic loop
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Guardrail checks
    if (totalTokensIn + totalTokensOut >= maxTokens) break;
    if (totalCost >= maxCostUsd) break;
    if (Date.now() - startTime >= timeoutMs) break;

    const opts: Record<string, unknown> = {
      model: aiModel,
      system: systemPrompt,
      messages,
      temperature: config.modelParams?.temperature,
      topP: config.modelParams?.topP,
      maxOutputTokens: config.modelParams?.maxOutputTokens,
    };
    if (Object.keys(toolDefs).length > 0) opts['tools'] = toolDefs;

    const result = await generateText(opts as Parameters<typeof generateText>[0]);

    const usage = result.usage as unknown as Record<string, number | undefined>;
    const tokensIn = usage?.['inputTokens'] ?? usage?.['promptTokens'] ?? 0;
    const tokensOut = usage?.['outputTokens'] ?? usage?.['completionTokens'] ?? 0;
    const cost = estimateCost(model, tokensIn, tokensOut) ?? 0;

    totalTokensIn += tokensIn;
    totalTokensOut += tokensOut;
    totalCost += cost;

    steps.push({
      type: 'llm_call',
      model,
      tokensIn,
      tokensOut,
      costUsd: cost,
    });

    // No tool calls → final response
    if (!result.toolCalls?.length) {
      return {
        output: result.text ?? '',
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        costUsd: totalCost,
        durationMs: Date.now() - startTime,
        steps,
      };
    }

    // Execute tool calls
    messages.push({ role: 'assistant', content: result.text || '' });

    for (const tc of result.toolCalls) {
      const toolName = tc.toolName;
      const args = (tc as unknown as Record<string, unknown>)['args'] as Record<string, unknown> ?? {};
      const executeFn = toolFns[toolName];

      if (!executeFn) {
        messages.push({
          role: 'tool',
          content: `Error: Tool "${toolName}" not found`,
          toolCallId: tc.toolCallId,
        });
        continue;
      }

      console.log(`  [tool] ${toolName}(${JSON.stringify(args)})`);

      try {
        const toolResult = await executeFn(args, toolContext);
        const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

        console.log(`  → ${resultStr.slice(0, 200)}`);

        steps.push({
          type: 'tool_call',
          toolName,
          toolArgs: args,
          toolResult: resultStr,
        });

        messages.push({
          role: 'tool',
          content: resultStr,
          toolCallId: tc.toolCallId,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        messages.push({
          role: 'tool',
          content: `Error: ${errMsg}`,
          toolCallId: tc.toolCallId,
        });
      }
    }
  }

  // Max iterations reached
  return {
    output: '[Max iterations reached]',
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    costUsd: totalCost,
    durationMs: Date.now() - startTime,
    steps,
  };
}

function createAiModel(model: string) {
  if (model.startsWith('claude')) {
    const anthropic = createAnthropic({});
    return anthropic(model);
  }
  const openai = createOpenAI({});
  return openai(model);
}
