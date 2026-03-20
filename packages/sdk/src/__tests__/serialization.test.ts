import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serializeAgentConfig, resolveModelString, zodToJsonSchema } from '../serialization.js';
import type { AgentConfig } from '../types.js';
import { agentsy } from '../agentsy.js';

describe('resolveModelString', () => {
  it('returns string model as-is', () => {
    expect(resolveModelString('claude-sonnet-4')).toBe('claude-sonnet-4');
  });

  it('resolves balanced+anthropic to claude-sonnet-4', () => {
    expect(resolveModelString({ class: 'balanced', provider: 'anthropic' })).toBe('claude-sonnet-4');
  });

  it('resolves fast+openai to gpt-4o-mini', () => {
    expect(resolveModelString({ class: 'fast', provider: 'openai' })).toBe('gpt-4o-mini');
  });

  it('resolves powerful+anthropic to claude-opus-4', () => {
    expect(resolveModelString({ class: 'powerful', provider: 'anthropic' })).toBe('claude-opus-4');
  });

  it('defaults to anthropic when no provider', () => {
    expect(resolveModelString({ class: 'balanced' })).toBe('claude-sonnet-4');
  });

  it('throws on unknown class', () => {
    expect(() => resolveModelString({ class: 'unknown' as never })).toThrow('Unknown capability class');
  });
});

describe('zodToJsonSchema', () => {
  it('converts simple object schema', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = zodToJsonSchema(schema);
    expect(result).toHaveProperty('type', 'object');
    expect(result).toHaveProperty('properties');
  });

  it('converts schema with nested objects', () => {
    const schema = z.object({
      user: z.object({ name: z.string() }),
    });
    const result = zodToJsonSchema(schema);
    expect(result).toHaveProperty('properties');
  });
});

describe('serializeAgentConfig', () => {
  const minimalConfig: AgentConfig = {
    slug: 'test-agent',
    model: 'claude-sonnet-4',
    systemPrompt: 'You are helpful.',
  };

  it('serializes minimal config correctly', () => {
    const frozen = agentsy.defineAgent(minimalConfig);
    const result = serializeAgentConfig(frozen);

    expect(result.systemPrompt).toBe('You are helpful.');
    expect(result.model).toBe('claude-sonnet-4');
    expect(result.modelSpec).toBe('claude-sonnet-4');
    expect(result.fallbackModel).toBeNull();
    expect(result.toolsConfig).toEqual([]);
    expect(result.guardrailsConfig).toEqual({});
    expect(result.modelParams).toEqual({});
  });

  it('serializes capability class model', () => {
    const config = agentsy.defineAgent({
      ...minimalConfig,
      model: { class: 'balanced', provider: 'anthropic' },
    });
    const result = serializeAgentConfig(config);

    expect(result.model).toBe('claude-sonnet-4');
    expect(result.modelSpec).toEqual({ class: 'balanced', provider: 'anthropic' });
  });

  it('serializes fallback model', () => {
    const config = agentsy.defineAgent({
      ...minimalConfig,
      fallbackModel: 'gpt-4o',
    });
    const result = serializeAgentConfig(config);
    expect(result.fallbackModel).toBe('gpt-4o');
  });

  it('serializes dynamic system prompt as placeholder', () => {
    const config = agentsy.defineAgent({
      ...minimalConfig,
      systemPrompt: () => 'dynamic',
    });
    const result = serializeAgentConfig(config);
    expect(result.systemPrompt).toContain('dynamic');
  });

  it('serializes native tools with JSON schema', () => {
    const tool = agentsy.defineTool({
      type: 'native',
      name: 'get_order',
      description: 'Get order',
      input: z.object({ id: z.string() }),
      execute: () => ({}),
    });
    const config = agentsy.defineAgent({ ...minimalConfig, tools: [tool] });
    const result = serializeAgentConfig(config);

    expect(result.toolsConfig).toHaveLength(1);
    expect(result.toolsConfig[0]?.name).toBe('get_order');
    expect(result.toolsConfig[0]?.type).toBe('native');
    expect(result.toolsConfig[0]?.inputSchema).toBeDefined();
    expect(result.toolsConfig[0]?.riskLevel).toBe('read');
  });

  it('serializes MCP tools', () => {
    const tool = agentsy.defineMcpTool({
      type: 'mcp',
      name: 'github',
      serverUrl: './mcp-github.js',
      transport: 'stdio',
      riskLevel: 'write',
    });
    const config = agentsy.defineAgent({ ...minimalConfig, tools: [tool] });
    const result = serializeAgentConfig(config);

    expect(result.toolsConfig).toHaveLength(1);
    expect(result.toolsConfig[0]?.type).toBe('mcp');
    expect(result.toolsConfig[0]?.mcpServerUrl).toBe('./mcp-github.js');
    expect(result.toolsConfig[0]?.riskLevel).toBe('write');
  });

  it('serializes guardrails with toolTimeout', () => {
    const config = agentsy.defineAgent({
      ...minimalConfig,
      guardrails: {
        maxIterations: 5,
        maxCostUsd: 0.5,
        toolTimeout: 15_000,
        outputValidation: [{ type: 'no_pii' }],
      },
    });
    const result = serializeAgentConfig(config);

    expect(result.guardrailsConfig.maxIterations).toBe(5);
    expect(result.guardrailsConfig.maxCostUsd).toBe(0.5);
    expect(result.guardrailsConfig.toolTimeout).toBe(15_000);
    expect(result.guardrailsConfig.outputValidation).toHaveLength(1);
  });
});
