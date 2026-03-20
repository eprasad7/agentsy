import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { messageRoleEnum } from './enums';
import { organizations } from './organizations';
import { runs } from './runs';
import { sessions } from './sessions';

export type MessageMetadata = {
  tokenCount?: number;
  truncated?: boolean;
  [key: string]: unknown;
};

export const messages = pgTable(
  'messages',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    sessionId: varchar('session_id', { length: 30 })
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    runId: varchar('run_id', { length: 30 }).references(() => runs.id, { onDelete: 'set null' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    toolCallId: varchar('tool_call_id', { length: 255 }),
    toolName: varchar('tool_name', { length: 255 }),
    messageOrder: integer('message_order').notNull(),
    metadata: jsonb('metadata').$type<MessageMetadata>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('messages_session_order_idx').on(table.sessionId, table.messageOrder),
    index('messages_org_id_idx').on(table.orgId),
    index('messages_run_id_idx').on(table.runId),
  ],
);
