import { createHash } from 'node:crypto';

import { apiKeys } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateApiKey, hashApiKey } from '../services/api-keys.js';

import { cleanOrgData, createTestDb, seedTestOrg, type TestDb } from './helpers.js';

describe('API Keys Lifecycle (integration)', () => {
  let db: TestDb;
  let orgData: Awaited<ReturnType<typeof seedTestOrg>>;

  beforeAll(async () => {
    db = createTestDb();
    orgData = await seedTestOrg(db, 'apikeys');
  });

  afterAll(async () => {
    await cleanOrgData(db, orgData.orgId);
  });

  it('generates and stores a new API key', async () => {
    const { fullKey, prefix, keyHash } = generateApiKey(orgData.slug);
    const id = newId('key');

    await db.insert(apiKeys).values({
      id,
      orgId: orgData.orgId,
      name: 'My New Key',
      prefix,
      keyHash,
      createdBy: orgData.userId,
    });

    // Verify stored
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    expect(result[0]!.keyHash).toBe(keyHash);
    expect(result[0]!.prefix).toBe(prefix);
    expect(result[0]!.name).toBe('My New Key');
  });

  it('looks up a key by hash', async () => {
    const { fullKey, keyHash } = generateApiKey(orgData.slug);
    const id = newId('key');

    await db.insert(apiKeys).values({
      id,
      orgId: orgData.orgId,
      name: 'Lookup Test',
      prefix: fullKey.slice(0, 16),
      keyHash,
    });

    // Lookup by hashing the raw key
    const lookupHash = hashApiKey(fullKey);
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, lookupHash))
      .limit(1);

    expect(result[0]!.id).toBe(id);
  });

  it('revokes a key and confirms it', async () => {
    const { keyHash } = generateApiKey(orgData.slug);
    const id = newId('key');

    await db.insert(apiKeys).values({
      id,
      orgId: orgData.orgId,
      name: 'Revoke Test',
      prefix: 'sk-agentsy-rev',
      keyHash,
    });

    // Revoke
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id));

    // Verify revoked
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    expect(result).toHaveLength(1);
    expect(result[0]!.revokedAt).not.toBeNull();
  });

  it('full key is never stored — only hash exists in DB', async () => {
    const { fullKey, keyHash } = generateApiKey(orgData.slug);
    const id = newId('key');

    await db.insert(apiKeys).values({
      id,
      orgId: orgData.orgId,
      name: 'No Plaintext Test',
      prefix: fullKey.slice(0, 16),
      keyHash,
    });

    // Read back all columns
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    const row = result[0]!;
    // No column contains the full key
    const allValues = Object.values(row).map(String);
    expect(allValues).not.toContain(fullKey);
    // But hash matches
    expect(row.keyHash).toBe(createHash('sha256').update(fullKey).digest('hex'));
  });
});
