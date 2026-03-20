import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { agentsy } from '../agentsy.js';
import type { AgentConfig } from '../types.js';

const minimalConfig: AgentConfig = {
  slug: 'test-agent',
  model: 'claude-sonnet-4',
  systemPrompt: 'You are a helpful assistant.',
};

describe('agentsy.defineAgent', () => {
  it('validates and returns a frozen config with minimal fields', () => {
    const agent = agentsy.defineAgent(minimalConfig);
    expect(agent.slug).toBe('test-agent');
    expect(agent.model).toBe('claude-sonnet-4');
    expect(Object.isFrozen(agent)).toBe(true);
  });

  it('accepts full config with all optional fields', () => {
    const agent = agentsy.defineAgent({
      slug: 'full-agent',
      name: 'Full Agent',
      description: 'A fully configured agent',
      model: { class: 'balanced', provider: 'anthropic' },
      fallbackModel: 'gpt-4o',
      systemPrompt: 'You are helpful.',
      tools: [
        agentsy.defineTool({
          type: 'native',
          name: 'get_data',
          description: 'Get data',
          input: z.object({ id: z.string() }),
          execute: () => ({ result: 'ok' }),
        }),
      ],
      guardrails: {
        maxIterations: 5,
        maxTokens: 10_000,
        maxCostUsd: 0.50,
        timeoutMs: 60_000,
        outputValidation: [{ type: 'no_pii' }],
      },
      memory: {
        sessionHistory: { maxMessages: 10 },
        knowledgeBases: ['docs'],
      },
      modelParams: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });
    expect(agent.name).toBe('Full Agent');
    expect(agent.guardrails?.maxIterations).toBe(5);
  });

  it('accepts dynamic system prompt function', () => {
    const agent = agentsy.defineAgent({
      ...minimalConfig,
      systemPrompt: (ctx) => `Hello, it is ${ctx.currentDate}`,
    });
    expect(typeof agent.systemPrompt).toBe('function');
  });

  it('accepts capability class model spec', () => {
    const agent = agentsy.defineAgent({
      ...minimalConfig,
      model: { class: 'fast' },
    });
    expect(agent.model).toEqual({ class: 'fast' });
  });

  it('rejects invalid slug — too short', () => {
    expect(() =>
      agentsy.defineAgent({ ...minimalConfig, slug: 'ab' }),
    ).toThrow();
  });

  it('rejects invalid slug — uppercase', () => {
    expect(() =>
      agentsy.defineAgent({ ...minimalConfig, slug: 'Test-Agent' }),
    ).toThrow();
  });

  it('rejects invalid slug — starts with hyphen', () => {
    expect(() =>
      agentsy.defineAgent({ ...minimalConfig, slug: '-test' }),
    ).toThrow();
  });

  it('rejects empty system prompt', () => {
    expect(() =>
      agentsy.defineAgent({ ...minimalConfig, systemPrompt: '' }),
    ).toThrow();
  });

  it('rejects guardrails out of range', () => {
    expect(() =>
      agentsy.defineAgent({
        ...minimalConfig,
        guardrails: { maxIterations: 0 },
      }),
    ).toThrow();

    expect(() =>
      agentsy.defineAgent({
        ...minimalConfig,
        guardrails: { maxIterations: 200 },
      }),
    ).toThrow();
  });
});
