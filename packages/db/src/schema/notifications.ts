import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { alertRules } from './alert-rules';
import { notificationTypeEnum } from './enums';
import { organizations } from './organizations';

export const notifications = pgTable(
  'notifications',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 255 }).notNull(),
    alertRuleId: varchar('alert_rule_id', { length: 30 }).references(() => alertRules.id, {
      onDelete: 'set null',
    }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: varchar('resource_id', { length: 30 }),
    channel: varchar('channel', { length: 20 }).notNull().default('in_app'),
    readAt: timestamp('read_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_org_user_idx').on(table.orgId, table.userId),
    index('notifications_unread_idx').on(table.userId, table.readAt),
  ],
);
