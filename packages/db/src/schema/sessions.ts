import { index, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { organizations } from './organizations';

export type SessionMetadata = {
  userId?: string;
  channel?: string;
  [key: string]: unknown;
};

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').$type<SessionMetadata>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('sessions_org_id_idx').on(table.orgId),
    index('sessions_agent_id_idx').on(table.agentId),
    index('sessions_created_at_idx').on(table.createdAt),
  ],
);
