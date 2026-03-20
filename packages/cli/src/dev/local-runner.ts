import type { AgentConfig, NativeToolDefinition, McpToolDefinition, ToolContext } from '@agentsy/sdk';
import { zodToJsonSchema } from '@agentsy/sdk';
import { estimateCost, GUARDRAIL_DEFAULTS } from '@agentsy/shared';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema } from 'ai';

import { McpStdioClient } from './mcp-stdio-client.js';

export interface RunResult {
  output: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  steps: RunStep[];
  guardrail_triggered?: string;
  violations?: string[];
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

// ── MCP Client Cache ────────────────────────────────────────────────

const mcpClients = new Map<string, McpStdioClient>();
const mcpToolMap = new Map<string, { client: McpStdioClient; serverName: string }>();
const mcpToolDefs = new Map<string, unknown>();

/**
 * Initialize MCP stdio clients for all MCP tool definitions.
 * Discovers tools and populates the tool map.
 */
export async function initMcpTools(config: AgentConfig): Promise<{
  toolDefs: Record<string, unknown>;
}> {
  const toolDefs: Record<string, unknown> = {};
  const mcpTools = (config.tools ?? []).filter(
    (t): t is McpToolDefinition => t.type === 'mcp',
  );

  for (const mcp of mcpTools) {
    if (mcp.transport !== 'stdio') continue;

    try {
      let client = mcpClients.get(mcp.name);
      if (!client) {
        // Parse command — serverUrl can be "./server.js" or "node server.js"
        const parts = mcp.serverUrl.split(' ');
        const command = parts[0]!;
        const args = parts.slice(1);
        client = new McpStdioClient(command, args);
        await client.connect();
        mcpClients.set(mcp.name, client);
      }

      const tools = await client.listTools();
      for (const tool of tools) {
        const def = {
          description: tool.description ?? tool.name,
          parameters: tool.inputSchema ? jsonSchema(tool.inputSchema) : jsonSchema({ type: 'object', properties: {} }),
        };
        mcpToolDefs.set(tool.name, def);
        mcpToolMap.set(tool.name, { client, serverName: mcp.name });
      }

      console.log(`  MCP "${mcp.name}": ${tools.length} tools discovered`);
    } catch (err) {
      console.error(`  MCP "${mcp.name}" failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { toolDefs };
}

/**
 * Disconnect all MCP clients.
 */
export function disconnectMcpClients(): void {
  for (const [, client] of mcpClients) {
    client.disconnect();
  }
  mcpClients.clear();
  mcpToolMap.clear();
  mcpToolDefs.clear();
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
  const aiModel = createAiModel(model);

  // Build native tool definitions
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

  // Add MCP tool definitions so LLM knows about them
  for (const [toolName, def] of mcpToolDefs) {
    if (!toolDefs[toolName]) {
      toolDefs[toolName] = def;
    }
  }

  // Build system prompt
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

    steps.push({ type: 'llm_call', model, tokensIn, tokensOut, costUsd: cost });

    if (!result.toolCalls?.length) {
      const outputText = result.text ?? '';

      // Run output validators (same as Temporal workflow)
      const violations = runLocalOutputValidation(
        outputText,
        config.guardrails?.outputValidation as Array<{ type: string; config?: Record<string, unknown> }> | undefined,
      );
      if (violations.length > 0) {
        console.warn(`\n  ⚠ Output validation: ${violations.join('; ')}`);
      }

      return {
        output: outputText,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        costUsd: totalCost,
        durationMs: Date.now() - startTime,
        steps,
        ...(violations.length > 0 ? { guardrail_triggered: 'output_validation', violations } : {}),
      };
    }

    messages.push({ role: 'assistant', content: result.text || '' });

    for (const tc of result.toolCalls) {
      const toolName = tc.toolName;
      const args = (tc as unknown as Record<string, unknown>)['args'] as Record<string, unknown> ?? {};

      console.log(`  [tool] ${toolName}(${JSON.stringify(args)})`);

      // Check if this is an MCP tool
      const mcpEntry = mcpToolMap.get(toolName);
      if (mcpEntry) {
        try {
          const mcpResult = await mcpEntry.client.callTool(toolName, args);
          const resultStr = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
          console.log(`  → ${resultStr.slice(0, 200)}`);
          steps.push({ type: 'tool_call', toolName, toolArgs: args, toolResult: resultStr });
          messages.push({ role: 'tool', content: resultStr, toolCallId: tc.toolCallId });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          messages.push({ role: 'tool', content: `Error: ${errMsg}`, toolCallId: tc.toolCallId });
        }
        continue;
      }

      // Native tool
      const executeFn = toolFns[toolName];
      if (!executeFn) {
        messages.push({
          role: 'tool',
          content: `Error: Tool "${toolName}" not found`,
          toolCallId: tc.toolCallId,
        });
        continue;
      }

      try {
        const toolResult = await executeFn(args, toolContext);
        const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
        console.log(`  → ${resultStr.slice(0, 200)}`);
        steps.push({ type: 'tool_call', toolName, toolArgs: args, toolResult: resultStr });
        messages.push({ role: 'tool', content: resultStr, toolCallId: tc.toolCallId });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        messages.push({ role: 'tool', content: `Error: ${errMsg}`, toolCallId: tc.toolCallId });
      }
    }
  }

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

// ── PII patterns (same as worker guardrails) ────────────────────────

const PII_PATTERNS: Record<string, RegExp> = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
  email: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
};

/**
 * Run output validators locally — mirrors the worker's output-validators.ts
 */
function runLocalOutputValidation(
  output: string,
  validators?: Array<{ type: string; config?: Record<string, unknown> }>,
): string[] {
  if (!validators?.length) return [];
  const violations: string[] = [];

  for (const v of validators) {
    switch (v.type) {
      case 'no_pii': {
        const found: string[] = [];
        for (const [category, pattern] of Object.entries(PII_PATTERNS)) {
          if (pattern.test(output)) found.push(category);
          pattern.lastIndex = 0;
        }
        if (found.length) violations.push(`PII detected: ${found.join(', ')}`);
        break;
      }
      case 'on_topic': {
        const topics = (v.config?.['topics'] as string[]) ?? [];
        if (topics.length > 0) {
          const lower = output.toLowerCase();
          if (!topics.some((t) => lower.includes(t.toLowerCase()))) {
            violations.push(`Off-topic. Expected: ${topics.join(', ')}`);
          }
        }
        break;
      }
      case 'content_policy': {
        const blocked = (v.config?.['blockedCategories'] as string[]) ?? ['harmful', 'illegal', 'sexual'];
        const lower = output.toLowerCase();
        const found = blocked.filter((b) => lower.includes(b.toLowerCase()));
        if (found.length) violations.push(`Blocked content: ${found.join(', ')}`);
        break;
      }
    }
  }

  return violations;
}
