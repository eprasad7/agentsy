import Fastify from 'fastify';
import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

import type { AgentConfig } from '@agentsy/sdk';
import { loadConfig } from './config-loader.js';
import { runAgent } from './local-runner.js';
import { startRepl } from './terminal-repl.js';
import { getPlaygroundHtml } from './playground.js';

export interface DevServerOptions {
  port: number;
  openBrowser: boolean;
}

export async function startDevServer(opts: DevServerOptions): Promise<void> {
  const cwd = process.cwd();

  // Load .env
  loadEnv({ path: resolve(cwd, '.env') });

  // Load config
  let agentConfig: AgentConfig;
  try {
    agentConfig = await loadConfig(cwd);
  } catch (err) {
    console.error(`Failed to load agentsy.config.ts: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log(`Loaded agent: ${agentConfig.name ?? agentConfig.slug}`);

  // Start Fastify server
  const app = Fastify({ logger: false });

  // Health check
  app.get('/health', async () => ({ status: 'ok', agent: agentConfig.slug }));

  // Playground UI
  app.get('/playground', async (_req, reply) => {
    reply.type('text/html');
    return getPlaygroundHtml(agentConfig.name ?? agentConfig.slug);
  });

  // Run agent
  app.post('/run', async (request) => {
    const body = request.body as { input?: string };
    if (!body?.input) {
      return { error: 'input is required' };
    }
    return runAgent(agentConfig, body.input);
  });

  // List runs (stub for playground compatibility)
  app.get('/runs', async () => ({ data: [] }));

  await app.listen({ port: opts.port, host: '0.0.0.0' });

  console.log(`\nServer running at http://localhost:${opts.port}`);
  console.log(`Playground: http://localhost:${opts.port}/playground`);

  // Watch config for hot-reload
  const configPath = resolve(cwd, 'agentsy.config.ts');
  const watcher = watch(configPath, async () => {
    try {
      agentConfig = await loadConfig(cwd);
      console.log('\n  Config reloaded.');
    } catch (err) {
      console.error(`\n  Config reload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Open browser
  if (opts.openBrowser) {
    const url = `http://localhost:${opts.port}/playground`;
    try {
      const { exec } = await import('node:child_process');
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} ${url}`);
    } catch {
      // Silently fail if browser can't open
    }
  }

  // Start terminal REPL
  startRepl(agentConfig);

  // Cleanup
  process.on('SIGINT', () => {
    watcher.close();
    app.close();
    process.exit(0);
  });
}
