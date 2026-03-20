import { describe, expect, it } from 'vitest';

import { generateApiKey, hashApiKey } from '../services/api-keys.js';

describe('API Key Service', () => {
  it('generates a key with correct format', () => {
    const result = generateApiKey('test-org');
    expect(result.fullKey).toMatch(/^sk-agentsy-test-org-[a-f0-9]{64}$/);
  });

  it('extracts a 16-char prefix', () => {
    const result = generateApiKey('my-company');
    expect(result.prefix).toHaveLength(16);
    expect(result.fullKey.startsWith(result.prefix)).toBe(true);
  });

  it('produces a 64-char SHA-256 hash', () => {
    const result = generateApiKey('test');
    expect(result.keyHash).toHaveLength(64);
    expect(result.keyHash).toMatch(/^[a-f0-9]+$/);
  });

  it('hash is deterministic for the same key', () => {
    const result = generateApiKey('test');
    expect(hashApiKey(result.fullKey)).toBe(result.keyHash);
  });

  it('generates unique keys each time', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey('test').fullKey));
    expect(keys.size).toBe(100);
  });

  it('truncates long org slugs in prefix', () => {
    const result = generateApiKey('very-long-organization-name');
    // slug prefix is first 8 chars
    expect(result.fullKey).toMatch(/^sk-agentsy-very-lon/);
  });
});
