import { boolean, jsonb, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { environmentTypeEnum } from './enums';
import { organizations } from './organizations';

export const environments = pgTable(
  'environments',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: environmentTypeEnum('name').notNull(),
    toolAllowList: jsonb('tool_allow_list').$type<string[] | null>(),
    toolDenyList: jsonb('tool_deny_list').$type<string[] | null>(),
    requireApprovalForWriteTools: boolean('require_approval_for_write_tools')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('environments_org_name_idx').on(table.orgId, table.name)],
);
