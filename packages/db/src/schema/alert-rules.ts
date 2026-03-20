import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { alertConditionTypeEnum } from './enums';
import { organizations } from './organizations';

export type NotificationChannel = {
  type: 'in_app' | 'email' | 'webhook';
  target?: string;
};

export const alertRules = pgTable(
  'alert_rules',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 30 }).references(() => agents.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    conditionType: alertConditionTypeEnum('condition_type').notNull(),
    threshold: doublePrecision('threshold').notNull(),
    windowMinutes: integer('window_minutes').notNull().default(5),
    comparisonOp: varchar('comparison_op', { length: 10 }).notNull().default('gt'),
    notificationChannels: jsonb('notification_channels')
      .$type<NotificationChannel[]>()
      .notNull()
      .default([]),
    enabled: boolean('enabled').notNull().default(true),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    cooldownMinutes: integer('cooldown_minutes').notNull().default(60),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('alert_rules_org_idx').on(table.orgId),
    index('alert_rules_agent_idx').on(table.agentId),
  ],
);
