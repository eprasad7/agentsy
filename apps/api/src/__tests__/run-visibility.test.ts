/**
 * Integration test: Run creation → early commit → cross-connection visibility
 *
 * Validates the exact race condition fix where:
 * 1. Run row is inserted on a scoped (reserved) DB connection
 * 2. Transaction is committed early
 * 3. Reserved connection is released
 * 4. A SEPARATE DB connection (simulating the Temporal worker) can see the row
 * 5. The separate connection can update the row
 * 6. The original handler (now on shared pool) can see the worker's update
 *
 * This is the sequence that was broken before the early-commit fix.
 */
import { randomBytes } from 'node:crypto';


import {
  agents,
  agentVersions,
  runs,
  runSteps,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import type { RunInput } from '@agentsy/shared';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanOrgData, createTestDb, seedTestOrg, type TestDb } from './helpers.js';

const TEST_DB_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://agentsy:agentsy_local@localhost:5432/agentsy_test';

describe('Run creation visibility (early commit)', () => {
  let sharedDb: TestDb;
  let orgData: Awaited<ReturnType<typeof seedTestOrg>>;
  let agentId: string;
  let versionId: string;

  beforeAll(async () => {
    sharedDb = createTestDb();
    orgData = await seedTestOrg(sharedDb, 'run-vis');

    // Create a test agent + version
    agentId = newId('ag');
    versionId = newId('ver');

    await sharedDb.insert(agents).values({
      id: agentId,
      orgId: orgData.orgId,
      name: 'Visibility Test Agent',
      slug: `vis-test-${randomBytes(4).toString('hex')}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await sharedDb.insert(agentVersions).values({
      id: versionId,
      agentId,
      orgId: orgData.orgId,
      version: 1,
      systemPrompt: 'test',
      model: 'claude-sonnet-4',
      toolsConfig: [],
      guardrailsConfig: {},
      modelParams: {},
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    // Clean up runs and steps first (FK dependencies)
    const allRuns = await sharedDb
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.orgId, orgData.orgId));

    for (const r of allRuns) {
      await sharedDb.delete(runSteps).where(eq(runSteps.runId, r.id));
    }
    await sharedDb.delete(runs).where(eq(runs.orgId, orgData.orgId));
    await sharedDb.delete(agentVersions).where(eq(agentVersions.agentId, agentId));
    await sharedDb.delete(agents).where(eq(agents.id, agentId));
    await cleanOrgData(sharedDb, orgData.orgId);
  });

  it('run row inserted in scoped transaction is visible to a separate connection after early commit', async () => {
    // Simulate the scoped connection (what the RLS middleware does)
    const scopedConn = postgres(TEST_DB_URL, { max: 1 });
    const scopedDb = drizzle(scopedConn);

    const runId = newId('run');
    const input: RunInput = { type: 'text', text: 'visibility test' };

    // 1. BEGIN + SET LOCAL on scoped connection
    await scopedDb.execute(sql`BEGIN`);
    await scopedDb.execute(sql.raw(`SET LOCAL app.org_id = '${orgData.orgId}'`));

    // 2. Insert run row on scoped connection (within transaction)
    await scopedDb.insert(runs).values({
      id: runId,
      orgId: orgData.orgId,
      agentId,
      versionId,
      environmentId: orgData.envIds['development']!,
      status: 'queued',
      input,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Verify the row is NOT visible on the shared pool (uncommitted)
    const beforeCommit = await sharedDb
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.id, runId));

    expect(beforeCommit).toHaveLength(0);

    // 4. COMMIT on scoped connection
    await scopedDb.execute(sql`COMMIT`);

    // 5. Release the scoped connection (what the handler now does)
    await scopedConn.end();

    // 6. Verify the row IS visible on the shared pool (committed)
    const afterCommit = await sharedDb
      .select({ id: runs.id, status: runs.status })
      .from(runs)
      .where(eq(runs.id, runId));

    expect(afterCommit).toHaveLength(1);
    expect(afterCommit[0]!.status).toBe('queued');

    // 7. Simulate the worker updating the row from its own connection
    const workerConn = postgres(TEST_DB_URL, { max: 1 });
    const workerDb = drizzle(workerConn);

    await workerDb
      .update(runs)
      .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
      .where(eq(runs.id, runId));

    await workerConn.end();

    // 8. Verify the shared pool sees the worker's update (simulates sync polling)
    const afterWorkerUpdate = await sharedDb
      .select({ id: runs.id, status: runs.status })
      .from(runs)
      .where(eq(runs.id, runId));

    expect(afterWorkerUpdate).toHaveLength(1);
    expect(afterWorkerUpdate[0]!.status).toBe('running');
  });

  it('rollback on scoped connection does not leave a visible run row', async () => {
    const scopedConn = postgres(TEST_DB_URL, { max: 1 });
    const scopedDb = drizzle(scopedConn);

    const runId = newId('run');
    const input: RunInput = { type: 'text', text: 'rollback test' };

    await scopedDb.execute(sql`BEGIN`);
    await scopedDb.execute(sql.raw(`SET LOCAL app.org_id = '${orgData.orgId}'`));

    await scopedDb.insert(runs).values({
      id: runId,
      orgId: orgData.orgId,
      agentId,
      versionId,
      environmentId: orgData.envIds['development']!,
      status: 'queued',
      input,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Rollback instead of commit (simulates error in handler)
    await scopedDb.execute(sql`ROLLBACK`);
    await scopedConn.end();

    // Row should NOT be visible
    const afterRollback = await sharedDb
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.id, runId));

    expect(afterRollback).toHaveLength(0);
  });

  it('worker and poller see consistent state through the full lifecycle', async () => {
    // Full lifecycle: insert → commit → release → worker update → poll sees update → worker completes → poll sees completion

    // Step 1: Scoped insert + commit + release
    const scopedConn = postgres(TEST_DB_URL, { max: 1 });
    const scopedDb = drizzle(scopedConn);
    const runId = newId('run');

    await scopedDb.execute(sql`BEGIN`);
    await scopedDb.execute(sql.raw(`SET LOCAL app.org_id = '${orgData.orgId}'`));
    await scopedDb.insert(runs).values({
      id: runId,
      orgId: orgData.orgId,
      agentId,
      versionId,
      environmentId: orgData.envIds['development']!,
      status: 'queued',
      input: { type: 'text', text: 'lifecycle test' } as RunInput,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await scopedDb.execute(sql`COMMIT`);
    await scopedConn.end();

    // Step 2: Worker marks running
    const workerConn = postgres(TEST_DB_URL, { max: 1 });
    const workerDb = drizzle(workerConn);
    await workerDb.update(runs).set({ status: 'running', startedAt: new Date() }).where(eq(runs.id, runId));

    // Step 3: Poller sees running
    const poll1 = await sharedDb.select({ status: runs.status }).from(runs).where(eq(runs.id, runId));
    expect(poll1[0]!.status).toBe('running');

    // Step 4: Worker marks completed
    await workerDb.update(runs).set({
      status: 'completed',
      output: { type: 'text', text: 'done' },
      completedAt: new Date(),
    }).where(eq(runs.id, runId));
    await workerConn.end();

    // Step 5: Poller sees completed
    const poll2 = await sharedDb.select({ status: runs.status }).from(runs).where(eq(runs.id, runId));
    expect(poll2[0]!.status).toBe('completed');
  });
});
