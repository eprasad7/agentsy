import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { agentVersions } from './agent-versions';
import { agents } from './agents';
import { deploymentStatusEnum } from './enums';
import { environments } from './environments';
import { organizations } from './organizations';

export const deployments = pgTable(
  'deployments',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    versionId: varchar('version_id', { length: 30 })
      .notNull()
      .references(() => agentVersions.id, { onDelete: 'restrict' }),
    environmentId: varchar('environment_id', { length: 30 })
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    status: deploymentStatusEnum('status').notNull().default('active'),
    deployedBy: varchar('deployed_by', { length: 255 }),
    deployedAt: timestamp('deployed_at', { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('deployments_active_lookup_idx').on(table.agentId, table.environmentId, table.status),
    index('deployments_org_id_idx').on(table.orgId),
    index('deployments_agent_id_idx').on(table.agentId),
  ],
);
