import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Command } from 'commander';

export function registerInitCommand(program: Command): void {
  program
    .command('init <name>')
    .description('Scaffold a new Agentsy agent project')
    .option('-t, --template <template>', 'Project template', 'basic')
    .action((name: string, opts: { template: string }) => {
      const dir = resolve(process.cwd(), name);

      if (existsSync(dir)) {
        console.error(`Error: Directory "${name}" already exists.`);
        process.exit(1);
      }

      console.log(`Creating ${name}...`);
      mkdirSync(dir, { recursive: true });

      if (opts.template === 'basic') {
        scaffoldBasic(dir, name);
      } else {
        console.error(`Unknown template: ${opts.template}. Available: basic`);
        process.exit(1);
      }

      console.log(`\nDone! Created ${name}/`);
      console.log(`\n  cd ${name}`);
      console.log('  pnpm install');
      console.log('  agentsy dev\n');
    });
}

function scaffoldBasic(dir: string, name: string): void {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  // package.json
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '0.0.1',
        private: true,
        type: 'module',
        scripts: {
          dev: 'agentsy dev',
          typecheck: 'tsc --noEmit',
        },
        dependencies: {
          '@agentsy/sdk': '^0.0.1',
          zod: '^4.0.0',
        },
        devDependencies: {
          typescript: '^5.7.0',
        },
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.json
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          outDir: 'dist',
          rootDir: '.',
        },
        include: ['*.ts', 'tools/**/*.ts'],
      },
      null,
      2,
    ) + '\n',
  );

  // .env.example
  writeFileSync(
    join(dir, '.env.example'),
    `# LLM providers (required for local dev)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Agentsy platform (required for deploy)
# AGENTSY_API_KEY=
`,
  );

  // .gitignore
  writeFileSync(
    join(dir, '.gitignore'),
    `node_modules/
dist/
.env
*.db
`,
  );

  // tools directory
  mkdirSync(join(dir, 'tools'), { recursive: true });

  // tools/get-order.ts — example tool
  writeFileSync(
    join(dir, 'tools', 'get-order.ts'),
    `import { agentsy } from '@agentsy/sdk';
import { z } from 'zod';

export const getOrder = agentsy.defineTool({
  type: 'native',
  name: 'get_order',
  description: 'Look up an order by ID and return its status',
  input: z.object({
    order_id: z.string().describe('The order ID to look up'),
  }),
  riskLevel: 'read',
  execute: async (input) => {
    // Replace with your actual order lookup logic
    return {
      order_id: input.order_id,
      status: 'shipped',
      total: 89.99,
      shipped_at: new Date().toISOString(),
    };
  },
});
`,
  );

  // tools/index.ts — barrel export
  writeFileSync(
    join(dir, 'tools', 'index.ts'),
    `export { getOrder } from './get-order.js';
`,
  );

  // agentsy.config.ts — main config
  writeFileSync(
    join(dir, 'agentsy.config.ts'),
    `import { agentsy } from '@agentsy/sdk';
import { getOrder } from './tools/index.js';

export default agentsy.defineAgent({
  slug: '${slug}',
  name: '${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ')}',
  description: 'An AI agent built with Agentsy',
  model: 'claude-sonnet-4',
  systemPrompt: \`You are a helpful assistant. Use available tools when needed to answer user questions.\`,
  tools: [getOrder],
  guardrails: {
    maxIterations: 10,
    maxTokens: 50_000,
    maxCostUsd: 1.0,
    timeoutMs: 300_000,
  },
  modelParams: {
    temperature: 0.7,
  },
});
`,
  );
}
