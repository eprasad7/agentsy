// Temporal worker bootstrap — connects to Temporal Cloud and polls the agent-runs queue.
// Phase 0: noop workflow + empty activities; Phase 2 registers real workflows/activities.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NativeConnection, Worker } from '@temporalio/worker';

import * as activities from './activities/index.js';
import { getTemporalConfig } from './client.js';

const TASK_QUEUE = process.env['TEMPORAL_TASK_QUEUE'] ?? 'agentsy-agent-runs';

function getWorkflowWorkerOptions(workerSourceDir: string) {
  const bundlePath = join(workerSourceDir, '..', 'dist', 'workflow-bundle.cjs');
  const workflowsPath = join(workerSourceDir, 'workflows', 'index.ts');

  if (existsSync(bundlePath)) {
    return { workflowBundle: { codePath: bundlePath } as const };
  }
  return { workflowsPath } as const;
}

async function run() {
  const config = getTemporalConfig();

  const connectionOptions: Parameters<typeof NativeConnection.connect>[0] = {
    address: config.address,
  };

  if (config.tls) {
    connectionOptions.tls = {
      clientCertPair: {
        crt: Buffer.from(config.tls.clientCert, 'utf-8'),
        key: Buffer.from(config.tls.clientKey, 'utf-8'),
      },
    };
  }

  const connection = await NativeConnection.connect(connectionOptions);
  const workerSourceDir = dirname(fileURLToPath(import.meta.url));
  const workflowOpts = getWorkflowWorkerOptions(workerSourceDir);

  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: TASK_QUEUE,
    ...workflowOpts,
    activities,
  });

  console.log(`Worker connected to ${config.address} (namespace: ${config.namespace})`);
  console.log(`Polling task queue: ${TASK_QUEUE}`);

  const shutdown = () => {
    console.log('Shutting down worker...');
    worker.shutdown();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err: unknown) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
