import { Command } from 'commander';

import { registerDevCommand } from './commands/dev.js';
import { registerEvalCompareCommand } from './commands/eval-compare.js';
import { registerEvalRunCommand } from './commands/eval-run.js';
import { registerInitCommand } from './commands/init.js';

const program = new Command();

program
  .name('agentsy')
  .description('Agentsy CLI — define, test, deploy, and monitor AI agents')
  .version('0.0.1');

registerInitCommand(program);
registerDevCommand(program);
registerEvalRunCommand(program);
registerEvalCompareCommand(program);

program.parse();
