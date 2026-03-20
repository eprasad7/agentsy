import type { VersionToolsConfig } from '@agentsy/db';

type ToolConfig = VersionToolsConfig[number];

interface ApprovalResult {
  requiresApproval: boolean;
}

/**
 * Risk level defaults by environment:
 * | Risk Level | Development | Staging | Production |
 * |-----------|-------------|---------|------------|
 * | read      | auto        | auto    | auto       |
 * | write     | auto        | auto    | approval   |
 * | admin     | approval    | approval| approval   |
 */
export function evaluateApprovalPolicy(
  toolDef: ToolConfig,
  environment: 'development' | 'staging' | 'production',
): ApprovalResult {
  const policy = toolDef.approvalPolicy;
  const riskLevel = toolDef.riskLevel ?? 'read';

  // Explicit overrides
  if (policy?.autoApprove) return { requiresApproval: false };
  if (policy?.requireApproval) return { requiresApproval: true };

  // Environment-specific override
  if (policy?.requireApprovalIn?.includes(environment)) {
    return { requiresApproval: true };
  }

  // Default risk matrix
  switch (riskLevel) {
    case 'read':
      return { requiresApproval: false };
    case 'write':
      return { requiresApproval: environment === 'production' };
    case 'admin':
      return { requiresApproval: true };
    default:
      return { requiresApproval: false };
  }
}
