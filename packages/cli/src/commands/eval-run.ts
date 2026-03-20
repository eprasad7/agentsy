import type { Command } from 'commander';

export function registerEvalRunCommand(program: Command): void {
  const evalCmd = program.commands.find((c) => c.name() === 'eval') ?? program.command('eval').description('Eval commands');

  evalCmd
    .command('run')
    .description('Run eval experiment against an agent')
    .option('-d, --dataset <name>', 'Dataset to run (default: all)')
    .option('-t, --tool-mode <mode>', 'Tool execution mode: mock | dry-run | live', 'mock')
    .option('-p, --parallelism <n>', 'Parallel case execution', '5')
    .option('--ci', 'Compare against baseline; exit 1 on regression')
    .option('--regression-threshold <n>', 'Max score drop before regression', '0.05')
    .option('-f, --format <format>', 'Output format: table | json | markdown', 'table')
    .option('--pr-comment', 'Alias for --format markdown')
    .option('--remote', 'Run against deployed agent (not local)')
    .option('-v, --verbose', 'Show per-case details')
    .action(
      async (opts: {
        dataset?: string;
        toolMode: string;
        parallelism: string;
        ci?: boolean;
        regressionThreshold: string;
        format: string;
        prComment?: boolean;
        remote?: boolean;
        verbose?: boolean;
      }) => {
        const { runEvalCommand } = await import('./eval-run-impl.js');
        await runEvalCommand({
          dataset: opts.dataset,
          toolMode: opts.toolMode as 'mock' | 'dry-run' | 'live',
          parallelism: parseInt(opts.parallelism, 10),
          ci: opts.ci ?? false,
          regressionThreshold: parseFloat(opts.regressionThreshold),
          format: opts.prComment ? 'markdown' : (opts.format as 'table' | 'json' | 'markdown'),
          remote: opts.remote ?? false,
          verbose: opts.verbose ?? false,
        });
      },
    );
}
