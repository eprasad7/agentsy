export * from './schema/index';
export { createClient, createPgClient, createSqliteClient } from './client';

// Re-export drizzle-orm helpers to ensure a single instance across packages
export { eq, and, or, isNull, desc, asc, sql, lt, gt } from 'drizzle-orm';
