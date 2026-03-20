import { createHash, randomBytes } from 'node:crypto';

import {
  apiKeys,
  environments,
  organizationMembers,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerAuthMiddleware } from '../middleware/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import { environmentRoutes } from '../routes/environments.js';
import { healthRoutes } from '../routes/health.js';
import { onboardingRoutes } from '../routes/onboarding.js';

import { cleanOrgData, createTestDb, type TestDb } from './helpers.js';

describe('E2E: Signup → Create Org → Environments Seeded → API Key Works', () => {
  let db: TestDb;
  let orgId: string;

  beforeAll(async () => {
    db = createTestDb();
  });

  afterAll(async () => {
    if (orgId) await cleanOrgData(db, orgId);
  });

  it('complete onboarding flow', async () => {
    // --- Step 1: Simulate signup (create user record manually since Better Auth needs HTTP) ---
    const userId = `user_e2e_${randomBytes(4).toString('hex')}`;

    // --- Step 2: Call onboarding endpoint to create org ---
    const app = Fastify();
    registerErrorHandler(app);

    // Skip real auth — inject userId directly for this test
    app.addHook('onRequest', async (request) => {
      request.userId = userId;
      request.authMethod = 'session';
    });

    onboardingRoutes(app, db as never);

    const slug = `e2e-test-${randomBytes(4).toString('hex')}`;
    const onboardRes = await app.inject({
      method: 'POST',
      url: '/v1/onboarding',
      payload: { name: 'E2E Test Org', slug },
    });

    expect(onboardRes.statusCode).toBe(201);
    const orgBody = JSON.parse(onboardRes.body);
    orgId = orgBody.id;
    expect(orgId).toMatch(/^org_/);
    expect(orgBody.name).toBe('E2E Test Org');
    expect(orgBody.plan).toBe('free');

    // --- Step 3: Verify 3 environments seeded ---
    const envs = await db
      .select()
      .from(environments)
      .where(eq(environments.orgId, orgId));

    expect(envs).toHaveLength(3);
    const envNames = envs.map((e) => e.name).sort();
    expect(envNames).toEqual(['development', 'production', 'staging']);

    // Production should require approval for write tools
    const prodEnv = envs.find((e) => e.name === 'production');
    expect(prodEnv!.requireApprovalForWriteTools).toBe(true);

    // --- Step 4: Verify admin membership created ---
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgId));

    expect(members).toHaveLength(1);
    expect(members[0]!.userId).toBe(userId);
    expect(members[0]!.role).toBe('admin');

    // --- Step 5: Create an API key and use it ---
    const rawKey = `sk-agentsy-${slug.slice(0, 8)}-${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await db.insert(apiKeys).values({
      id: newId('key'),
      orgId,
      name: 'E2E Key',
      prefix: rawKey.slice(0, 16),
      keyHash,
      createdBy: userId,
    });

    // --- Step 6: Use the API key to authenticate ---
    const authApp = Fastify();
    registerErrorHandler(authApp);
    registerAuthMiddleware(authApp, db as never);
    await healthRoutes(authApp, db as never);
    environmentRoutes(authApp, db as never);

    const healthRes = await authApp.inject({
      method: 'GET',
      url: '/health',
    });
    expect(healthRes.statusCode).toBe(200);

    // Use API key to list environments
    const envRes = await authApp.inject({
      method: 'GET',
      url: '/v1/environments',
      headers: { authorization: `Bearer ${rawKey}` },
    });
    expect(envRes.statusCode).toBe(200);
    const envBody = JSON.parse(envRes.body);
    expect(envBody.data).toHaveLength(3);
  });
});
