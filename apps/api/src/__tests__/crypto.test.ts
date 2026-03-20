import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decrypt, encrypt, sha256 } from '../lib/crypto.js';

const TEST_KEY = randomBytes(32);

describe('AES-256-GCM crypto', () => {
  it('encrypts and decrypts a string roundtrip', () => {
    const plaintext = 'sk-ant-api03-mysecretkey';
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same-value';
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a, TEST_KEY)).toBe(plaintext);
    expect(decrypt(b, TEST_KEY)).toBe(plaintext);
  });

  it('encrypted format is iv:ciphertext:authTag', () => {
    const encrypted = encrypt('test', TEST_KEY);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
  });

  it('fails to decrypt with wrong key', () => {
    const encrypted = encrypt('secret', TEST_KEY);
    const wrongKey = randomBytes(32);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const encrypted = encrypt('secret', TEST_KEY);
    const parts = encrypted.split(':');
    // Tamper with the ciphertext
    const tampered = `${parts[0]}:ff${parts[1]!.slice(2)}:${parts[2]}`;
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });

  it('fails on invalid format', () => {
    expect(() => decrypt('not-valid-format', TEST_KEY)).toThrow('Invalid encrypted value format');
  });
});

describe('sha256', () => {
  it('produces a 64-char hex string', () => {
    const hash = sha256('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', () => {
    expect(sha256('test')).toBe(sha256('test'));
  });
});
