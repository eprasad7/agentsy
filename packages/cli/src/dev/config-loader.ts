import { resolve } from 'node:path';

import type { AgentConfig } from '@agentsy/sdk';
import { createJiti } from 'jiti';

/**
 * Load agentsy.config.ts from the current working directory using jiti.
 */
export async function loadConfig(cwd: string): Promise<AgentConfig> {
  const configPath = resolve(cwd, 'agentsy.config.ts');
  const jiti = createJiti(import.meta.url, { interopDefault: true });

  const mod = await jiti.import(configPath) as { default?: AgentConfig } | AgentConfig;
  const config = ('default' in mod ? mod.default : mod) as AgentConfig;

  if (!config?.slug) {
    throw new Error(`Invalid config at ${configPath} — missing slug`);
  }

  return config;
}
