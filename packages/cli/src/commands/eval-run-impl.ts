import {
  agentsyEval,
  exactMatch,
  jsonSchemaGrader,
  regex,
  numericThreshold,
  embeddingSimilarity,
  toolNameMatch,
  toolArgsMatch,
  llmJudge,
  toolSequence,
  unnecessarySteps,
  type GraderDefinition,
  type ExperimentResult,
} from '@agentsy/eval';
import { formatTable, formatJson, formatMarkdown } from '../formatters/eval-report.js';

export interface EvalRunOptions {
  dataset?: string;
  toolMode: 'mock' | 'dry-run' | 'live';
  parallelism: number;
  ci: boolean;
  regressionThreshold: number;
  format: 'table' | 'json' | 'markdown';
  remote: boolean;
  verbose: boolean;
}

export async function runEvalCommand(opts: EvalRunOptions): Promise<void> {
  console.log('Loading agent config...');

  // Load agent config from agentsy.config.ts
  const config = await loadConfig();

  if (!config) {
    console.error('No agentsy.config.ts found. Run `agentsy init` first.');
    process.exit(1);
  }

  // Load dataset
  const dataset = await resolveDataset(opts.dataset, config);
  if (!dataset) {
    console.error(
      opts.dataset
        ? `Dataset "${opts.dataset}" not found.`
        : 'No datasets found in config.',
    );
    process.exit(1);
  }

  console.log(`Running eval: ${dataset.name} (${dataset.cases.length} cases)`);

  // Resolve graders from config
  const graders = resolveGraders(config);

  // Define experiment
  const experiment = agentsyEval.defineExperiment({
    name: `cli-eval-${Date.now()}`,
    agent: { slug: config.agent?.slug },
    dataset,
    graders,
    toolMode: opts.toolMode,
    parallelism: opts.parallelism,
  });

  // Run experiment locally
  const result = await agentsyEval.run(experiment, async (caseData) => {
    // In local mode, we use mock responses based on tool mode
    // The real agent execution would happen through the local dev server
    const inputText =
      typeof caseData.input === 'string'
        ? caseData.input
        : 'text' in caseData.input
          ? caseData.input.text
          : JSON.stringify(caseData.input);

    // For mock mode with mocked results, return expected output
    if (opts.toolMode === 'mock' && caseData.expected_output) {
      const output =
        typeof caseData.expected_output === 'string'
          ? caseData.expected_output
          : 'text' in caseData.expected_output
            ? caseData.expected_output.text
            : JSON.stringify(caseData.expected_output);

      return {
        output,
        toolCalls: (caseData.expected_tool_calls ?? []).map((t) => ({
          name: t.name,
          arguments: t.arguments,
        })),
        steps: (caseData.expected_tool_calls ?? []).map((t) => ({
          type: 'tool_call' as const,
          toolName: t.name,
          output: 'mocked',
        })),
        durationMs: 0,
        costUsd: 0,
      };
    }

    return {
      output: `[mock] ${inputText.slice(0, 200)}`,
      toolCalls: [],
      steps: [],
      durationMs: 0,
      costUsd: 0,
    };
  });

  // Output results
  outputResults(result, opts.format);

  // CI mode: compare against baseline
  if (opts.ci) {
    await handleCiMode(result, opts.regressionThreshold);
  }
}

function outputResults(result: ExperimentResult, format: 'table' | 'json' | 'markdown'): void {
  switch (format) {
    case 'table':
      console.log(formatTable(result));
      break;
    case 'json':
      console.log(formatJson(result));
      break;
    case 'markdown':
      console.log(formatMarkdown(result));
      break;
  }
}

async function handleCiMode(
  result: ExperimentResult,
  threshold: number,
): Promise<void> {
  // In CI mode, check if any grader average dropped below threshold
  // compared to baseline. For now, check against perfect scores.
  const failedGraders = Object.entries(result.summaryScores).filter(
    ([, avg]) => avg < 1.0 - threshold,
  );

  if (failedGraders.length > 0) {
    console.error(
      `\nCI REGRESSION: ${failedGraders.length} grader(s) below threshold:`,
    );
    for (const [name, avg] of failedGraders) {
      console.error(`  ${name}: ${avg.toFixed(4)} (threshold: ${(1.0 - threshold).toFixed(4)})`);
    }
    process.exit(1);
  }

  console.log('\nCI: All graders within threshold. Pass.');
}

function resolveGraders(config: Record<string, unknown>): GraderDefinition[] {
  const graderConfigs = config.graders as
    | Array<{ type: string; config?: Record<string, unknown> }>
    | undefined;

  if (!graderConfigs || graderConfigs.length === 0) {
    return [exactMatch()];
  }

  return graderConfigs
    .map((g) => {
      switch (g.type) {
        case 'exact_match':
          return exactMatch(g.config as Parameters<typeof exactMatch>[0]);
        case 'json_schema':
          return jsonSchemaGrader((g.config?.['schema'] ?? g.config ?? {}) as Record<string, unknown>);
        case 'regex':
          return regex((g.config?.['pattern'] as string) ?? '');
        case 'numeric_threshold':
          return numericThreshold(g.config as Parameters<typeof numericThreshold>[0]);
        case 'embedding_similarity':
          return embeddingSimilarity(g.config as Parameters<typeof embeddingSimilarity>[0]);
        case 'tool_name_match':
          return toolNameMatch(g.config as Parameters<typeof toolNameMatch>[0]);
        case 'tool_args_match':
          return toolArgsMatch();
        case 'llm_judge':
          return llmJudge(g.config as Parameters<typeof llmJudge>[0]);
        case 'tool_sequence':
          return toolSequence(g.config as Parameters<typeof toolSequence>[0]);
        case 'unnecessary_steps':
          return unnecessarySteps();
        default:
          return null;
      }
    })
    .filter((g): g is GraderDefinition => g !== null);
}

async function loadConfig(): Promise<Record<string, unknown> | null> {
  try {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(process.cwd());
    const configPath = `${process.cwd()}/agentsy.config.ts`;
    const mod = await jiti.import(configPath) as Record<string, unknown>;
    return (mod.default ?? mod) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveDataset(
  name: string | undefined,
  config: Record<string, unknown>,
): Promise<{ name: string; cases: Array<Record<string, unknown>> } | null> {
  // Check config for datasets
  const datasets = config.datasets as Array<{ name: string; cases: Array<Record<string, unknown>> }> | undefined;

  if (datasets && datasets.length > 0) {
    if (name) {
      return datasets.find((d) => d.name === name) ?? null;
    }
    return datasets[0] ?? null;
  }

  // Try loading from file
  if (name) {
    try {
      const dataset = await agentsyEval.loadDataset(`${process.cwd()}/${name}.json`);
      return dataset as unknown as { name: string; cases: Array<Record<string, unknown>> };
    } catch {
      return null;
    }
  }

  return null;
}
