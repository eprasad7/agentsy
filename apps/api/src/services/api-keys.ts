import { randomBytes } from 'node:crypto';

import { sha256 } from '../lib/crypto.js';

export interface GeneratedApiKey {
  id: string;
  fullKey: string;
  prefix: string;
  keyHash: string;
}

export function generateApiKey(orgSlug: string): Omit<GeneratedApiKey, 'id'> {
  const slugPrefix = orgSlug.slice(0, 8).toLowerCase();
  const random = randomBytes(32).toString('hex');
  const fullKey = `sk-agentsy-${slugPrefix}-${random}`;
  const prefix = fullKey.slice(0, 16);
  const keyHash = sha256(fullKey);

  return { fullKey, prefix, keyHash };
}

export function hashApiKey(key: string): string {
  return sha256(key);
}
