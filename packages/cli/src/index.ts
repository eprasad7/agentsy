import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerDevCommand } from './commands/dev.js';

const program = new Command();

program
  .name('agentsy')
  .description('Agentsy CLI — define, test, deploy, and monitor AI agents')
  .version('0.0.1');

registerInitCommand(program);
registerDevCommand(program);

program.parse();
