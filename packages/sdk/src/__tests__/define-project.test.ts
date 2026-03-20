import { describe, it, expect } from 'vitest';

import { agentsy } from '../agentsy.js';

describe('agentsy.defineProject', () => {
  const agent1 = {
    slug: 'support-agent',
    model: 'claude-sonnet-4' as const,
    systemPrompt: 'You are a support agent.',
  };
  const agent2 = {
    slug: 'triage-agent',
    model: 'claude-sonnet-4' as const,
    systemPrompt: 'You triage incoming requests.',
  };

  it('validates and returns frozen project config', () => {
    const project = agentsy.defineProject({
      agents: [agent1, agent2],
    });
    expect(project.agents).toHaveLength(2);
    expect(Object.isFrozen(project)).toBe(true);
  });

  it('accepts project with defaults', () => {
    const project = agentsy.defineProject({
      agents: [agent1],
      defaults: {
        model: { class: 'balanced' },
        guardrails: { maxIterations: 5 },
        modelParams: { temperature: 0.7 },
      },
    });
    expect(project.defaults?.guardrails?.maxIterations).toBe(5);
  });

  it('rejects empty agents array', () => {
    expect(() =>
      agentsy.defineProject({ agents: [] }),
    ).toThrow();
  });

  it('rejects project with invalid agent slug', () => {
    expect(() =>
      agentsy.defineProject({
        agents: [{ slug: 'ab', model: 'claude-sonnet-4', systemPrompt: 'test' }],
      }),
    ).toThrow();
  });
});
