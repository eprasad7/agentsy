import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const apiKeys = pgTable(
  'api_keys',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    prefix: varchar('prefix', { length: 16 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_prefix_idx').on(table.prefix),
    index('api_keys_org_id_idx').on(table.orgId),
  ],
);
