import { generateText, jsonSchema } from 'ai';
import { estimateCost } from '@agentsy/shared';
import { callWithFallback } from '../providers/fallback-handler.js';

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
 * Activity: Call LLM via Vercel AI SDK with fallback support.
 */
export async function llmCall(input: LlmCallInput): Promise<LlmCallResult> {
  // Build tool definitions using jsonSchema
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

      return generateText(opts as Parameters<typeof generateText>[0]);
    },
    {
      primaryModel: input.model,
      fallbackModel: input.fallbackModel,
    },
  );

  // AI SDK v6 uses inputTokens/outputTokens
  const usage = result.usage as unknown as Record<string, number | undefined>;
  const tokensIn = usage?.['inputTokens'] ?? usage?.['promptTokens'] ?? 0;
  const tokensOut = usage?.['outputTokens'] ?? usage?.['completionTokens'] ?? 0;
  const costUsd = estimateCost(input.model, tokensIn, tokensOut) ?? 0;

  return {
    text: result.text ?? '',
    toolCalls: (result.toolCalls ?? []).map((tc) => ({
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
