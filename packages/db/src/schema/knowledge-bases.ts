import { bigint, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { organizations } from './organizations';

export const knowledgeBases = pgTable(
  'knowledge_bases',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    embeddingModel: varchar('embedding_model', { length: 100 })
      .notNull()
      .default('text-embedding-3-small'),
    embeddingDimensions: integer('embedding_dimensions').notNull().default(1536),
    chunkSize: integer('chunk_size').notNull().default(512),
    chunkOverlap: integer('chunk_overlap').notNull().default(64),
    totalChunks: integer('total_chunks').notNull().default(0),
    totalDocuments: integer('total_documents').notNull().default(0),
    totalSizeBytes: bigint('total_size_bytes', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('knowledge_bases_org_id_idx').on(table.orgId),
    index('knowledge_bases_agent_id_idx').on(table.agentId),
  ],
);
