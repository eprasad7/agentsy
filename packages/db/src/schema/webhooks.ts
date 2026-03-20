import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const webhooks = pgTable(
  'webhooks',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2048 }).notNull(),
    events: jsonb('events').$type<string[]>().notNull(),
    secretHash: varchar('secret_hash', { length: 64 }).notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('webhooks_org_id_idx').on(table.orgId)],
);
