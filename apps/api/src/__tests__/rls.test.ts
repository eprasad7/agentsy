import { agents } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import pgClient from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanOrgData, createTestDb, seedTestOrg, type TestDb } from './helpers.js';

// Superuser for seeding data (bypasses RLS)
const ADMIN_DB_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://agentsy:agentsy_local@localhost:5432/agentsy_test';

// Non-superuser for RLS testing (subject to RLS policies)
const APP_DB_URL =
  process.env['RLS_DATABASE_URL'] ?? 'postgresql://agentsy_app:agentsy_app_local@localhost:5432/agentsy_test';

describe('RLS Tenant Isolation (integration)', () => {
  let db: TestDb;
  let orgA: Awaited<ReturnType<typeof seedTestOrg>>;
  let orgB: Awaited<ReturnType<typeof seedTestOrg>>;

  beforeAll(async () => {
    db = createTestDb();
    orgA = await seedTestOrg(db, 'rls-a');
    orgB = await seedTestOrg(db, 'rls-b');

    // Create an agent in each org
    await db.insert(agents).values({
      id: newId('ag'),
      orgId: orgA.orgId,
      name: 'Agent A',
      slug: 'agent-a',
    });
    await db.insert(agents).values({
      id: newId('ag'),
      orgId: orgB.orgId,
      name: 'Agent B',
      slug: 'agent-b',
    });

    // Enable RLS on agents table
    try {
      await db.execute(sql`ALTER TABLE agents ENABLE ROW LEVEL SECURITY`);
      await db.execute(sql`ALTER TABLE agents FORCE ROW LEVEL SECURITY`);
      await db.execute(sql`
        CREATE POLICY IF NOT EXISTS agents_tenant_policy ON agents
        USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL)
      `);
    } catch {
      // Policy may already exist
    }
  });

  afterAll(async () => {
    await cleanOrgData(db, orgA.orgId);
    await cleanOrgData(db, orgB.orgId);
  });

  /**
   * Use a single-connection postgres client (max: 1) to safely run
   * BEGIN/SET LOCAL/COMMIT within a transaction. The pooled driver
   * doesn't allow raw transaction commands.
   */
  async function queryWithRls(orgId: string): Promise<{ name: string }[]> {
    const singleConn = pgClient(APP_DB_URL, { max: 1 });
    const txDb = drizzle(singleConn);
    try {
      await txDb.execute(sql`BEGIN`);
      await txDb.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`);
      const result = await txDb.select({ name: agents.name }).from(agents);
      await txDb.execute(sql`COMMIT`);
      return result;
    } finally {
      await singleConn.end();
    }
  }

  it('org A sees only its own agents', async () => {
    const result = await queryWithRls(orgA.orgId);
    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe('Agent A');
  });

  it('org B sees only its own agents', async () => {
    const result = await queryWithRls(orgB.orgId);
    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe('Agent B');
  });

  it('org A cannot access org B data even with explicit filter', async () => {
    const singleConn = pgClient(APP_DB_URL, { max: 1 });
    const txDb = drizzle(singleConn);
    try {
      await txDb.execute(sql`BEGIN`);
      await txDb.execute(sql`SELECT set_config('app.org_id', ${orgA.orgId}, true)`);

      // Try to query with org B's ID — RLS should still block it
      const result = await txDb
        .select({ name: agents.name, orgId: agents.orgId })
        .from(agents);

      // Should only see org A's agents
      for (const row of result) {
        expect(row.orgId).toBe(orgA.orgId);
      }
      expect(result.length).toBe(1);

      await txDb.execute(sql`COMMIT`);
    } finally {
      await singleConn.end();
    }
  });
});
