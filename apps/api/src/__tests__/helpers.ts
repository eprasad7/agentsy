import { createHash, randomBytes } from 'node:crypto';

import {
  agents,
  apiKeys,
  environments,
  organizationMembers,
  organizations,
  tenantSecrets,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const TEST_DB_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://agentsy:agentsy_local@localhost:5432/agentsy_test';

export function createTestDb() {
  const client = postgres(TEST_DB_URL);
  return drizzle(client);
}

export type TestDb = ReturnType<typeof createTestDb>;

/** Seed an org + admin member + API key. Returns all IDs and the raw API key. */
export async function seedTestOrg(db: TestDb, slugSuffix?: string) {
  const orgId = newId('org');
  const userId = `user_${randomBytes(8).toString('hex')}`;
  const slug = `test-org-${slugSuffix ?? randomBytes(4).toString('hex')}`;

  await db.insert(organizations).values({
    id: orgId,
    name: `Test Org ${slug}`,
    slug,
    externalAuthId: `auth_${randomBytes(8).toString('hex')}`,
    plan: 'free',
  });

  await db.insert(organizationMembers).values({
    id: newId('mem'),
    orgId,
    userId,
    role: 'admin',
  });

  // Create environments
  const envIds: Record<string, string> = {};
  for (const name of ['development', 'staging', 'production'] as const) {
    const envId = newId('env');
    envIds[name] = envId;
    await db.insert(environments).values({ id: envId, orgId, name });
  }

  // Create API key
  const rawKey = `sk-agentsy-${slug.slice(0, 8)}-${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyId = newId('key');

  await db.insert(apiKeys).values({
    id: keyId,
    orgId,
    name: 'Test Key',
    prefix: rawKey.slice(0, 16),
    keyHash,
    createdBy: userId,
  });

  return { orgId, userId, slug, rawKey, keyId, envIds };
}

/** Clean up data for a specific org only. */
export async function cleanOrgData(db: TestDb, orgId: string) {
  await db.delete(tenantSecrets).where(eq(tenantSecrets.orgId, orgId));
  await db.delete(apiKeys).where(eq(apiKeys.orgId, orgId));
  await db.delete(environments).where(eq(environments.orgId, orgId));
  await db.delete(organizationMembers).where(eq(organizationMembers.orgId, orgId));
  await db.delete(agents).where(eq(agents.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
}
