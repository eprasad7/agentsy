import type { Command } from 'commander';

export function registerEvalCompareCommand(program: Command): void {
  const evalCmd = program.commands.find((c) => c.name() === 'eval') ?? program.command('eval').description('Eval commands');

  evalCmd
    .command('compare <baseline-id> <candidate-id>')
    .description('Compare two eval experiments')
    .option('-f, --format <format>', 'Output format: table | json', 'table')
    .action(
      async (
        baselineId: string,
        candidateId: string,
        opts: { format: string },
      ) => {
        const { runCompareCommand } = await import('./eval-compare-impl.js');
        await runCompareCommand({
          baselineId,
          candidateId,
          format: opts.format as 'table' | 'json',
        });
      },
    );
}
