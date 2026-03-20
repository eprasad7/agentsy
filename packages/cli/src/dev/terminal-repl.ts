import { createInterface } from 'node:readline';
import type { AgentConfig } from '@agentsy/sdk';
import { runAgent } from './local-runner.js';

/**
 * Start an interactive terminal REPL for chatting with the agent.
 * Takes a getter function so hot-reloaded config is always used.
 */
export function startRepl(getConfig: () => AgentConfig): void {
  const config = getConfig();
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nYou: ',
  });

  console.log(`\nAgent: ${config.name ?? config.slug}`);
  console.log('Type a message to chat. Ctrl+C to exit.\n');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    try {
      // Always use latest config via getter
      const currentConfig = getConfig();
      const result = await runAgent(currentConfig, input);

      console.log(`\nAgent: ${result.output}`);
      console.log(
        `\nCost: $${result.costUsd.toFixed(4)} | Tokens: ${result.tokensIn} in / ${result.tokensOut} out | ${(result.durationMs / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });
}
