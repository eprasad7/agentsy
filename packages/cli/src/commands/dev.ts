import type { Command } from 'commander';

export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description('Start local development server with REPL and playground')
    .option('-p, --port <port>', 'Server port', '4321')
    .option('--no-browser', 'Do not open browser')
    .action(async (opts: { port: string; browser: boolean }) => {
      // Dynamically import to avoid loading dev deps at init time
      const { startDevServer } = await import('../dev/local-server.js');
      await startDevServer({ port: Number(opts.port), openBrowser: opts.browser });
    });
}
