import { tenantSecrets } from '@agentsy/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decrypt } from '../lib/crypto.js';
import { createSecret, deleteSecret, getSecretValue, listSecrets, updateSecret } from '../services/secrets.js';

import { cleanOrgData, createTestDb, seedTestOrg, type TestDb } from './helpers.js';

// Set a test master key
process.env['SECRETS_MASTER_KEY'] = 'a'.repeat(64);

describe('Secrets Service (integration)', () => {
  let db: TestDb;
  let orgData: Awaited<ReturnType<typeof seedTestOrg>>;

  beforeAll(async () => {
    db = createTestDb();
    orgData = await seedTestOrg(db, 'secrets');
  });

  afterAll(async () => {
    await cleanOrgData(db, orgData.orgId);
  });

  it('creates an encrypted secret', async () => {
    const result = await createSecret(db as never, {
      orgId: orgData.orgId,
      name: 'Anthropic Key',
      key: 'ANTHROPIC_API_KEY',
      value: 'sk-ant-test-key-12345',
      environment: 'production',
    });

    expect(result.id).toMatch(/^sec_/);
    expect(result.key).toBe('ANTHROPIC_API_KEY');

    // Verify the value is actually encrypted in the DB
    const row = await db
      .select({ encryptedValue: tenantSecrets.encryptedValue })
      .from(tenantSecrets)
      .where(eq(tenantSecrets.id, result.id))
      .limit(1);

    expect(row[0]!.encryptedValue).not.toBe('sk-ant-test-key-12345');
    expect(row[0]!.encryptedValue).toContain(':'); // iv:ciphertext:tag format
  });

  it('lists secrets without values', async () => {
    const secrets = await listSecrets(db as never, orgData.orgId);
    expect(secrets.length).toBeGreaterThan(0);

    // Should not contain encryptedValue
    for (const s of secrets) {
      expect(s).not.toHaveProperty('encryptedValue');
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('key');
    }
  });

  it('decrypts a secret value internally', async () => {
    const value = await getSecretValue(
      db as never,
      orgData.orgId,
      'ANTHROPIC_API_KEY',
      'production',
    );
    expect(value).toBe('sk-ant-test-key-12345');
  });

  it('updates/rotates a secret value', async () => {
    const secrets = await listSecrets(db as never, orgData.orgId);
    const secretId = secrets[0]!.id;

    await updateSecret(db as never, orgData.orgId, secretId, 'new-rotated-value');

    const value = await getSecretValue(
      db as never,
      orgData.orgId,
      'ANTHROPIC_API_KEY',
      'production',
    );
    expect(value).toBe('new-rotated-value');
  });

  it('deletes a secret', async () => {
    const secrets = await listSecrets(db as never, orgData.orgId);
    const secretId = secrets[0]!.id;

    await deleteSecret(db as never, orgData.orgId, secretId);

    const remaining = await listSecrets(db as never, orgData.orgId);
    expect(remaining.length).toBe(0);
  });

  it('returns null for non-existent secret', async () => {
    const value = await getSecretValue(
      db as never,
      orgData.orgId,
      'DOES_NOT_EXIST',
      'production',
    );
    expect(value).toBeNull();
  });
});
