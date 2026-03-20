import { watch } from 'node:fs';
import { resolve } from 'node:path';

import type { AgentConfig } from '@agentsy/sdk';
import { config as loadEnv } from 'dotenv';
import Fastify from 'fastify';

import { loadConfig } from './config-loader.js';
import { runAgent, initMcpTools, disconnectMcpClients } from './local-runner.js';
import { getPlaygroundHtml } from './playground.js';
import { startRepl } from './terminal-repl.js';

export interface DevServerOptions {
  port: number;
  openBrowser: boolean;
}

export async function startDevServer(opts: DevServerOptions): Promise<void> {
  const cwd = process.cwd();

  // Load .env
  loadEnv({ path: resolve(cwd, '.env') });

  // Validate API keys early
  if (!process.env['ANTHROPIC_API_KEY'] && !process.env['OPENAI_API_KEY']) {
    console.warn('Warning: Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set. LLM calls will fail.');
    console.warn('Set them in .env or as environment variables.\n');
  }

  // Load config
  let agentConfig: AgentConfig;
  try {
    agentConfig = await loadConfig(cwd);
  } catch (err) {
    console.error(`Failed to load agentsy.config.ts: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log(`Loaded agent: ${agentConfig.name ?? agentConfig.slug}`);

  // Initialize MCP tool clients
  await initMcpTools(agentConfig);

  // Start Fastify server
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok', agent: agentConfig.slug }));

  app.get('/playground', async (_req, reply) => {
    reply.type('text/html');
    return getPlaygroundHtml(agentConfig.name ?? agentConfig.slug);
  });

  app.post('/run', async (request) => {
    const body = request.body as { input?: string };
    if (!body?.input) {
      return { error: 'input is required' };
    }
    return runAgent(agentConfig, body.input);
  });

  app.get('/runs', async () => ({ data: [] }));

  await app.listen({ port: opts.port, host: '0.0.0.0' });

  console.log(`\nServer running at http://localhost:${opts.port}`);
  console.log(`Playground: http://localhost:${opts.port}/playground`);

  // Watch config for hot-reload
  const configPath = resolve(cwd, 'agentsy.config.ts');
  const watcher = watch(configPath, async () => {
    try {
      // Reload .env in case keys changed
      loadEnv({ path: resolve(cwd, '.env'), override: true });

      // Disconnect old MCP clients
      disconnectMcpClients();

      agentConfig = await loadConfig(cwd);

      // Re-init MCP tools
      await initMcpTools(agentConfig);

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

  // Start terminal REPL with getter for always-fresh config
  startRepl(() => agentConfig);

  // Cleanup
  process.on('SIGINT', () => {
    watcher.close();
    disconnectMcpClients();
    app.close();
    process.exit(0);
  });
}
