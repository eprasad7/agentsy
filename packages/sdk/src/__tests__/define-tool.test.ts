import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { agentsy } from '../agentsy.js';

describe('agentsy.defineTool', () => {
  it('validates and returns a frozen native tool', () => {
    const tool = agentsy.defineTool({
      type: 'native',
      name: 'get_order',
      description: 'Look up an order',
      input: z.object({ orderId: z.string() }),
      execute: (input) => ({ id: input.orderId, status: 'shipped' }),
    });
    expect(tool.type).toBe('native');
    expect(tool.name).toBe('get_order');
    expect(Object.isFrozen(tool)).toBe(true);
  });

  it('accepts tool with risk level and approval policy', () => {
    const tool = agentsy.defineTool({
      type: 'native',
      name: 'send_email',
      description: 'Send an email',
      input: z.object({ to: z.string(), body: z.string() }),
      execute: async () => ({ sent: true }),
      riskLevel: 'write',
      timeout: 10_000,
      approvalPolicy: {
        requireApprovalIn: ['production'],
      },
    });
    expect(tool.type).toBe('native');
    if (tool.type === 'native') {
      expect(tool.riskLevel).toBe('write');
    }
  });

  it('rejects invalid tool name — camelCase', () => {
    expect(() =>
      agentsy.defineTool({
        type: 'native',
        name: 'getOrder',
        description: 'Bad name',
        input: z.object({}),
        execute: () => ({}),
      }),
    ).toThrow();
  });

  it('rejects invalid tool name — starts with number', () => {
    expect(() =>
      agentsy.defineTool({
        type: 'native',
        name: '1_tool',
        description: 'Bad name',
        input: z.object({}),
        execute: () => ({}),
      }),
    ).toThrow();
  });

  it('rejects tool without Zod input schema', () => {
    expect(() =>
      agentsy.defineTool({
        type: 'native',
        name: 'bad_tool',
        description: 'Missing schema',
        input: { type: 'string' } as never,
        execute: () => ({}),
      }),
    ).toThrow();
  });
});

describe('agentsy.defineMcpTool', () => {
  it('validates and returns a frozen MCP tool', () => {
    const tool = agentsy.defineMcpTool({
      type: 'mcp',
      name: 'github-tools',
      serverUrl: './mcp-github.js',
      transport: 'stdio',
      description: 'GitHub integration',
      riskLevel: 'read',
    });
    expect(tool.type).toBe('mcp');
    expect(tool.name).toBe('github-tools');
    expect(Object.isFrozen(tool)).toBe(true);
  });

  it('rejects empty server URL', () => {
    expect(() =>
      agentsy.defineMcpTool({
        type: 'mcp',
        name: 'bad-mcp',
        serverUrl: '',
        transport: 'stdio',
      }),
    ).toThrow();
  });
});
