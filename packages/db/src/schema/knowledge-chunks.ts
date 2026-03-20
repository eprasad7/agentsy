import { index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { tsvector, vector } from './custom-types';
import { knowledgeBases } from './knowledge-bases';
import { organizations } from './organizations';

export type ChunkMetadata = {
  sourceType?: 'pdf' | 'txt' | 'md' | 'csv';
  pageNumber?: number;
  section?: string;
  headings?: string[];
  [key: string]: unknown;
};

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: varchar('id', { length: 30 }).primaryKey(),
    knowledgeBaseId: varchar('knowledge_base_id', { length: 30 })
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    orgId: varchar('org_id', { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentName: varchar('document_name', { length: 1024 }).notNull(),
    documentHash: varchar('document_hash', { length: 64 }).notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    tsv: tsvector('tsv'),
    tokenCount: integer('token_count').notNull().default(0),
    embeddingModel: varchar('embedding_model', { length: 100 }),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<ChunkMetadata>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('knowledge_chunks_kb_id_idx').on(table.knowledgeBaseId),
    index('knowledge_chunks_org_id_idx').on(table.orgId),
    index('knowledge_chunks_doc_hash_idx').on(table.documentHash),
  ],
);
