
import { tenantSecrets } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq, and } from 'drizzle-orm';

import { encrypt, decrypt } from '../lib/crypto.js';
import type { DbClient } from '../lib/db.js';
import { notFound } from '../plugins/error-handler.js';

export interface CreateSecretInput {
  orgId: string;
  name: string;
  key: string;
  value: string;
  environment: 'development' | 'staging' | 'production';
  description?: string;
  createdBy?: string;
}

export async function createSecret(db: DbClient, input: CreateSecretInput) {
  const encryptedValue = encrypt(input.value);
  const [ivPart] = encryptedValue.split(':');

  const id = newId('sec');
  await db.insert(tenantSecrets).values({
    id,
    orgId: input.orgId,
    name: input.name,
    key: input.key,
    encryptedValue,
    iv: ivPart!,
    environment: input.environment,
    description: input.description,
    createdBy: input.createdBy,
  });

  return { id, name: input.name, key: input.key, environment: input.environment };
}

export async function listSecrets(
  db: DbClient,
  orgId: string,
) {
  return db
    .select({
      id: tenantSecrets.id,
      name: tenantSecrets.name,
      key: tenantSecrets.key,
      environment: tenantSecrets.environment,
      description: tenantSecrets.description,
      lastRotatedAt: tenantSecrets.lastRotatedAt,
      createdAt: tenantSecrets.createdAt,
    })
    .from(tenantSecrets)
    .where(eq(tenantSecrets.orgId, orgId));
}

export async function deleteSecret(db: DbClient, orgId: string, secretId: string) {
  const result = await db
    .delete(tenantSecrets)
    .where(and(eq(tenantSecrets.id, secretId), eq(tenantSecrets.orgId, orgId)))
    .returning({ id: tenantSecrets.id });

  if (!result.length) {
    throw notFound('Secret not found');
  }
}

export async function getSecretValue(
  db: DbClient,
  orgId: string,
  key: string,
  environment: 'development' | 'staging' | 'production',
): Promise<string | null> {
  const result = await db
    .select({ encryptedValue: tenantSecrets.encryptedValue })
    .from(tenantSecrets)
    .where(
      and(
        eq(tenantSecrets.orgId, orgId),
        eq(tenantSecrets.key, key),
        eq(tenantSecrets.environment, environment),
      ),
    )
    .limit(1);

  if (!result[0]) return null;
  return decrypt(result[0].encryptedValue);
}
