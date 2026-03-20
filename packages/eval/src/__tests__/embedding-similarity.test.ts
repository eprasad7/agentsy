import { describe, it, expect } from 'vitest';

import { cosineSimilarity } from '../graders/embedding-similarity.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('returns 0.0 for zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBeCloseTo(0.0);
  });

  it('computes similarity correctly for non-trivial vectors', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});
