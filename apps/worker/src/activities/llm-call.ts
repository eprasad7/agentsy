import { estimateCost } from '@agentsy/shared';
import { streamText, jsonSchema } from 'ai';

import { callWithFallback } from '../providers/fallback-handler.js';
import { publishRunEvent } from '../streaming/event-emitter.js';

export interface LlmCallInput {
  model: string;
  fallbackModel?: string | null;
  systemPrompt: string;
  messages: Array<{ role: string; content: string; toolCallId?: string }>;
  tools?: Record<string, { description: string; parameters: Record<string, unknown> }>;
  modelParams?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
  // Streaming context
  runId?: string;
  stepId?: string;
}

export interface LlmCallResult {
  text: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
}

/**
 * Activity: Call LLM via Vercel AI SDK with streaming + fallback support.
 * Uses streamText() for token-level streaming, publishes step.text_delta events via Redis.
 */
export async function llmCall(input: LlmCallInput): Promise<LlmCallResult> {
  // Build tool definitions
  const tools: Record<string, unknown> = {};
  if (input.tools) {
    for (const [name, def] of Object.entries(input.tools)) {
      tools[name] = {
        description: def.description,
        parameters: jsonSchema(def.parameters),
      };
    }
  }

  // Convert to AI SDK message format
  const messages = input.messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: [{
          type: 'tool-result' as const,
          toolCallId: m.toolCallId ?? '',
          toolName: '',
          output: m.content,
        }],
      };
    }
    return { role: m.role as 'user' | 'assistant', content: m.content };
  });

  const result = await callWithFallback(
    async (model) => {
      const opts: Record<string, unknown> = {
        model,
        system: input.systemPrompt,
        messages,
        temperature: input.modelParams?.temperature,
        topP: input.modelParams?.topP,
        maxOutputTokens: input.modelParams?.maxOutputTokens,
      };
      if (Object.keys(tools).length > 0) opts['tools'] = tools;

      const stream = streamText(opts as Parameters<typeof streamText>[0]);

      // Accumulate full text while streaming tokens
      let fullText = '';
      for await (const chunk of stream.textStream) {
        fullText += chunk;

        // Emit step.text_delta event via Redis
        if (input.runId && input.stepId && chunk) {
          await publishRunEvent(input.runId, {
            type: 'step.text_delta',
            step_id: input.stepId,
            delta: chunk,
          });
        }
      }

      // Await final result for usage and tool calls
      const finalResult = await stream;

      return { fullText, finalResult };
    },
    {
      primaryModel: input.model,
      fallbackModel: input.fallbackModel,
    },
  );

  const { fullText, finalResult } = result;

  // Await promise-based properties from streamText result
  const text = await finalResult.text;
  const toolCalls = await finalResult.toolCalls;
  const usage = await finalResult.usage as unknown as Record<string, number | undefined>;
  const tokensIn = usage?.['inputTokens'] ?? usage?.['promptTokens'] ?? 0;
  const tokensOut = usage?.['outputTokens'] ?? usage?.['completionTokens'] ?? 0;
  const costUsd = estimateCost(input.model, tokensIn, tokensOut) ?? 0;

  return {
    text: fullText || text || '',
    toolCalls: (toolCalls ?? []).map((tc: { toolCallId: string; toolName: string }) => ({
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: (tc as unknown as Record<string, unknown>)['args'] as Record<string, unknown> ?? {},
    })),
    tokensIn,
    tokensOut,
    costUsd,
    model: input.model,
  };
}
