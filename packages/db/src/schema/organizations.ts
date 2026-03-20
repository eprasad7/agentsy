import { jsonb, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { orgPlanEnum } from './enums';

export type OrgMetadata = {
  maxAgents?: number;
  maxRunsPerDay?: number;
  maxTokensPerDay?: number;
  maxConcurrentRuns?: number;
  features?: string[];
  retentionDays?: number;
};

export const organizations = pgTable(
  'organizations',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 63 }).notNull(),
    externalAuthId: varchar('external_auth_id', { length: 255 }).notNull(),
    plan: orgPlanEnum('plan').notNull().default('free'),
    billingEmail: varchar('billing_email', { length: 255 }),
    metadata: jsonb('metadata').$type<OrgMetadata>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('organizations_slug_idx').on(table.slug),
    uniqueIndex('organizations_external_auth_id_idx').on(table.externalAuthId),
  ],
);
