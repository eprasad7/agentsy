import type { DatasetDefinition } from './types.js';

/**
 * Define an eval dataset with inline cases.
 * Validates and returns a frozen definition.
 */
export function defineDataset(def: DatasetDefinition): Readonly<DatasetDefinition> {
  if (!def.name || def.name.trim().length === 0) {
    throw new Error('Dataset name is required');
  }
  if (!def.cases || def.cases.length === 0) {
    throw new Error('Dataset must have at least one case');
  }

  for (let i = 0; i < def.cases.length; i++) {
    const c = def.cases[i]!;
    if (c.input === undefined || c.input === null) {
      throw new Error(`Case ${i}: input is required`);
    }
    if (typeof c.input === 'string' && c.input.trim().length === 0) {
      throw new Error(`Case ${i}: input must not be empty`);
    }
  }

  return Object.freeze({ ...def, cases: def.cases.map((c) => Object.freeze(c)) });
}

/**
 * Load a dataset from a JSON file (Node.js only).
 */
export async function loadDataset(filePath: string): Promise<DatasetDefinition> {
  const fs = await import('node:fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as DatasetDefinition;
  return defineDataset(data);
}
