import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { orgMemberRoleEnum } from './enums';
import { organizations } from './organizations';

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 255 }).notNull(),
    role: orgMemberRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('org_members_org_user_idx').on(table.orgId, table.userId),
    index('org_members_user_id_idx').on(table.userId),
  ],
);
