import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const hex = process.env['SECRETS_MASTER_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('SECRETS_MASTER_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string, masterKeyOverride?: Buffer): string {
  const key = masterKeyOverride ?? getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decrypt(encryptedValue: string, masterKeyOverride?: Buffer): string {
  const key = masterKeyOverride ?? getMasterKey();
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const iv = Buffer.from(parts[0]!, 'hex');
  const ciphertext = Buffer.from(parts[1]!, 'hex');
  const authTag = Buffer.from(parts[2]!, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString('hex');
}
