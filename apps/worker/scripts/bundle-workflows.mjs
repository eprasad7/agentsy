/**
 * Pre-bundles workflow code for production Docker images.
 * Runs after `tsup` so `dist/` exists.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleWorkflowCode } from '@temporalio/worker';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflowsPath = join(root, 'src', 'workflows', 'index.ts');
const outDir = join(root, 'dist');
const outFile = join(outDir, 'workflow-bundle.cjs');

const { code } = await bundleWorkflowCode({ workflowsPath });
await mkdir(outDir, { recursive: true });
await writeFile(outFile, code);
console.log(`Wrote ${outFile}`);
