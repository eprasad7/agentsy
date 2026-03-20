import { index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { environmentTypeEnum } from './enums';
import { organizations } from './organizations';

export const tenantSecrets = pgTable(
  'tenant_secrets',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    iv: varchar('iv', { length: 32 }).notNull(),
    environment: environmentTypeEnum('environment').notNull(),
    description: text('description'),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tenant_secrets_org_key_env_idx').on(table.orgId, table.key, table.environment),
    index('tenant_secrets_org_id_idx').on(table.orgId),
  ],
);
