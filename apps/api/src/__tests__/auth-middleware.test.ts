import { createHash, randomBytes } from 'node:crypto';

import { apiKeys } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerAuthMiddleware } from '../middleware/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';

import { cleanTestData, createTestDb, seedTestOrg, type TestDb } from './helpers.js';

describe('Auth Middleware (integration)', () => {
  let db: TestDb;
  let orgData: Awaited<ReturnType<typeof seedTestOrg>>;

  beforeAll(async () => {
    db = createTestDb();
    await cleanTestData(db);
    orgData = await seedTestOrg(db, 'auth');
  });

  afterAll(async () => {
    await cleanTestData(db);
  });

  async function buildApp() {
    const app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, db as never);
    app.get('/v1/test', async (request) => ({
      org_id: request.orgId,
      auth_method: request.authMethod,
    }));
    return app;
  }

  it('authenticates with a valid API key', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/test',
      headers: { authorization: `Bearer ${orgData.rawKey}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_id).toBe(orgData.orgId);
    expect(body.auth_method).toBe('api_key');
  });

  it('returns 401 for missing auth header', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/test' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.type).toContain('unauthorized');
  });

  it('returns 401 for invalid API key', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/test',
      headers: { authorization: 'Bearer sk-agentsy-fake-000000000000000000000000000000000000000000000000000000000000000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for revoked API key', async () => {
    // Revoke the key
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, orgData.keyId));

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/test',
      headers: { authorization: `Bearer ${orgData.rawKey}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.type).toContain('forbidden');

    // Un-revoke for other tests
    await db
      .update(apiKeys)
      .set({ revokedAt: null })
      .where(eq(apiKeys.id, orgData.keyId));
  });

  it('allows public routes without auth', async () => {
    const app = await buildApp();
    // Health is a public route
    app.get('/health', async () => ({ status: 'ok' }));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
