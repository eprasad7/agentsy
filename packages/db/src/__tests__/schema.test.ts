import { describe, expect, it } from 'vitest';

import * as schema from '../schema';

describe('Postgres schema', () => {
  it('exports all 25 beta tables', () => {
    const tables = [
      schema.organizations,
      schema.organizationMembers,
      schema.apiKeys,
      schema.agents,
      schema.agentVersions,
      schema.environments,
      schema.deployments,
      schema.sessions,
      schema.runs,
      schema.runSteps,
      schema.messages,
      schema.evalDatasets,
      schema.evalDatasetCases,
      schema.evalExperiments,
      schema.evalExperimentResults,
      schema.evalBaselines,
      schema.knowledgeBases,
      schema.knowledgeChunks,
      schema.tenantSecrets,
      schema.webhooks,
      schema.usageDaily,
      schema.connectors,
      schema.connectorConnections,
      schema.alertRules,
      schema.notifications,
    ];

    expect(tables).toHaveLength(25);
    for (const table of tables) {
      expect(table).toBeDefined();
    }
  });

  it('exports all 11 enums', () => {
    const enums = [
      schema.orgPlanEnum,
      schema.orgMemberRoleEnum,
      schema.environmentTypeEnum,
      schema.runStatusEnum,
      schema.stepTypeEnum,
      schema.messageRoleEnum,
      schema.evalExperimentStatusEnum,
      schema.deploymentStatusEnum,
      schema.approvalStatusEnum,
      schema.alertConditionTypeEnum,
      schema.notificationTypeEnum,
    ];

    expect(enums).toHaveLength(11);
    for (const e of enums) {
      expect(e).toBeDefined();
    }
  });
});
