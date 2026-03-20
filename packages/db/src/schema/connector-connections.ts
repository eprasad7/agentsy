import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { connectors } from './connectors';
import { organizations } from './organizations';

export const connectorConnections = pgTable(
  'connector_connections',
  {
    id: text('id').primaryKey(),
    connectorId: text('connector_id')
      .notNull()
      .references(() => connectors.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    environment: text('environment').notNull().default('all'),
    status: text('status').notNull().default('pending'),
    accountLabel: text('account_label'),
    encryptedAccessToken: text('encrypted_access_token'),
    iv: text('iv'),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    refreshIv: text('refresh_iv'),
    tokenExpiresAt: timestamp('token_expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    lastRefreshAt: timestamp('last_refresh_at'),
    refreshFailureCount: integer('refresh_failure_count').notNull().default(0),
    disconnectedAt: timestamp('disconnected_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('connector_conn_agent_connector_idx').on(
      table.agentId,
      table.connectorId,
      table.environment,
    ),
    index('connector_conn_org_idx').on(table.orgId),
    index('connector_conn_expires_idx').on(table.tokenExpiresAt),
  ],
);
