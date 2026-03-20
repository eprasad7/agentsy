import { agents } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanTestData, createTestDb, seedTestOrg, type TestDb } from './helpers.js';

describe('RLS Tenant Isolation (integration)', () => {
  let db: TestDb;
  let orgA: Awaited<ReturnType<typeof seedTestOrg>>;
  let orgB: Awaited<ReturnType<typeof seedTestOrg>>;

  beforeAll(async () => {
    db = createTestDb();
    await cleanTestData(db);
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

    // Enable RLS on agents table (if not already)
    try {
      await db.execute(sql`ALTER TABLE agents ENABLE ROW LEVEL SECURITY`);
      await db.execute(sql`ALTER TABLE agents FORCE ROW LEVEL SECURITY`);
      await db.execute(sql`
        CREATE POLICY IF NOT EXISTS agents_tenant_policy ON agents
        USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL)
      `);
    } catch {
      // Policy may already exist from migration
    }
  });

  afterAll(async () => {
    await db.execute(sql`RESET app.org_id`);
    await cleanTestData(db);
  });

  it('org A can see only its own agents when RLS context is set', async () => {
    await db.execute(sql`BEGIN`);
    await db.execute(sql`SET LOCAL app.org_id = ${orgA.orgId}`);

    const result = await db.select().from(agents);
    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe('Agent A');

    await db.execute(sql`COMMIT`);
  });

  it('org B can see only its own agents when RLS context is set', async () => {
    await db.execute(sql`BEGIN`);
    await db.execute(sql`SET LOCAL app.org_id = ${orgB.orgId}`);

    const result = await db.select().from(agents);
    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe('Agent B');

    await db.execute(sql`COMMIT`);
  });

  it('org A cannot access org B data', async () => {
    await db.execute(sql`BEGIN`);
    await db.execute(sql`SET LOCAL app.org_id = ${orgA.orgId}`);

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.orgId, orgB.orgId));

    // RLS should filter this out even with explicit org_id filter
    expect(result.length).toBe(0);

    await db.execute(sql`COMMIT`);
  });
});
