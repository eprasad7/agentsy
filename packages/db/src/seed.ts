import { createHash, randomBytes } from 'node:crypto';

import { newId } from '@agentsy/shared';

import { createPgClient } from './client';
import { agents } from './schema/agents';
import { apiKeys } from './schema/api-keys';
import { environments } from './schema/environments';
import { organizationMembers } from './schema/organization-members';
import { organizations } from './schema/organizations';

async function seed() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run seed');
  }

  const db = createPgClient(databaseUrl);

  const orgId = newId('org');
  const userId = 'user_test_seed';

  // Create test organization
  await db.insert(organizations).values({
    id: orgId,
    name: 'Test Organization',
    slug: 'test-org',
    externalAuthId: 'auth_test_seed',
    plan: 'free',
  });

  // Create test member
  await db.insert(organizationMembers).values({
    id: newId('mem'),
    orgId,
    userId,
    role: 'admin',
  });

  // Create test API key
  const rawKey = `sk-agentsy-${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  await db.insert(apiKeys).values({
    id: newId('key'),
    orgId,
    name: 'Test API Key',
    prefix: rawKey.slice(0, 12),
    keyHash,
    createdBy: userId,
  });

  // Create default environments
  for (const envName of ['development', 'staging', 'production'] as const) {
    await db.insert(environments).values({
      id: newId('env'),
      orgId,
      name: envName,
    });
  }

  // Create test agent
  await db.insert(agents).values({
    id: newId('ag'),
    orgId,
    name: 'Test Agent',
    slug: 'test-agent',
    description: 'A test agent for development',
  });

  console.log('Seed complete');
  console.log(`  Org ID: ${orgId}`);
  console.log(`  API Key: ${rawKey}`);
  console.log(`  API Key Hash: ${keyHash}`);
}

seed().catch(console.error);
