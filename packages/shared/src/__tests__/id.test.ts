import { describe, expect, it } from 'vitest';

import { newId } from '../id.js';

const URL_SAFE_REGEX = /^[0-9A-Za-z]+$/;

describe('newId', () => {
  it('returns a string with the correct prefix', () => {
    const id = newId('org');
    expect(id.startsWith('org_')).toBe(true);
  });

  it('generates 21-char suffix after prefix', () => {
    const id = newId('org');
    const suffix = id.slice('org_'.length);
    expect(suffix).toHaveLength(21);
  });

  it('uses only URL-safe alphanumeric characters', () => {
    const id = newId('run');
    const suffix = id.slice('run_'.length);
    expect(suffix).toMatch(URL_SAFE_REGEX);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId('ag')));
    expect(ids.size).toBe(1000);
  });

  it('works with all prefixes', () => {
    const prefixes = [
      'org', 'mem', 'key', 'ag', 'ver', 'env', 'dep',
      'run', 'stp', 'ses', 'msg', 'eds', 'edc', 'exp',
      'exr', 'ebl', 'kb', 'kc', 'sec', 'usg', 'whk',
      'con', 'conn', 'alr', 'ntf',
    ] as const;

    for (const prefix of prefixes) {
      const id = newId(prefix);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id.slice(`${prefix}_`.length)).toHaveLength(21);
    }
  });
});
