import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export type OAuthConfig = {
  authorization_url: string;
  token_url: string;
  scopes: string[];
  client_id_env_var: string;
  client_secret_env_var: string;
};

export type ConnectorToolManifest = {
  name: string;
  description: string;
  risk_level: 'read' | 'write' | 'admin';
  input_schema: Record<string, unknown>;
};

export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  iconUrl: text('icon_url'),
  category: text('category').notNull(),
  authType: text('auth_type').notNull(),
  oauthConfig: jsonb('oauth_config').$type<OAuthConfig>(),
  toolsManifest: jsonb('tools_manifest').$type<ConnectorToolManifest[]>().notNull(),
  status: text('status').notNull().default('available'),
  deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
