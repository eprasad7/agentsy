import { describe, it, expect } from 'vitest';

import { evaluateApprovalPolicy } from '../tools/risk-policy.js';

describe('evaluateApprovalPolicy', () => {
  // Read tools — auto-approve everywhere
  it('read tool auto-approves in development', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native', riskLevel: 'read' }, 'development')).toEqual({ requiresApproval: false });
  });

  it('read tool auto-approves in production', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native', riskLevel: 'read' }, 'production')).toEqual({ requiresApproval: false });
  });

  // Write tools — approval in production only
  it('write tool auto-approves in development', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native', riskLevel: 'write' }, 'development')).toEqual({ requiresApproval: false });
  });

  it('write tool auto-approves in staging', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native', riskLevel: 'write' }, 'staging')).toEqual({ requiresApproval: false });
  });

  it('write tool requires approval in production', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native', riskLevel: 'write' }, 'production')).toEqual({ requiresApproval: true });
  });

  // Admin tools — approval everywhere
  it('admin tool requires approval in development', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native', riskLevel: 'admin' }, 'development')).toEqual({ requiresApproval: true });
  });

  it('admin tool requires approval in production', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native', riskLevel: 'admin' }, 'production')).toEqual({ requiresApproval: true });
  });

  // Explicit overrides
  it('autoApprove overrides admin in production', () => {
    expect(evaluateApprovalPolicy(
      { name: 't', type: 'native', riskLevel: 'admin', approvalPolicy: { autoApprove: true } },
      'production',
    )).toEqual({ requiresApproval: false });
  });

  it('requireApproval overrides read in development', () => {
    expect(evaluateApprovalPolicy(
      { name: 't', type: 'native', riskLevel: 'read', approvalPolicy: { requireApproval: true } },
      'development',
    )).toEqual({ requiresApproval: true });
  });

  it('requireApprovalIn for specific environments', () => {
    expect(evaluateApprovalPolicy(
      { name: 't', type: 'native', riskLevel: 'read', approvalPolicy: { requireApprovalIn: ['staging'] } },
      'staging',
    )).toEqual({ requiresApproval: true });
    expect(evaluateApprovalPolicy(
      { name: 't', type: 'native', riskLevel: 'read', approvalPolicy: { requireApprovalIn: ['staging'] } },
      'development',
    )).toEqual({ requiresApproval: false });
  });

  // Default risk level is 'read'
  it('defaults to read when no riskLevel specified', () => {
    expect(evaluateApprovalPolicy({ name: 't', type: 'native' }, 'production')).toEqual({ requiresApproval: false });
  });
});
