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
    agent: { slug: (config.agent as Record<string, unknown> | undefined)?.slug as string | undefined },
    dataset: dataset as unknown as import('@agentsy/eval').DatasetDefinition,
    graders,
    toolMode: opts.toolMode,
    parallelism: opts.parallelism,
  });

  // Run experiment
  let result: ExperimentResult;
  if (opts.remote) {
    result = await runRemoteExperiment(experiment, config);
  } else {
    result = await agentsyEval.run(experiment);
  }

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
  // Try to load baseline from local file (baseline.json in project root)
  let baselineScores: Record<string, number> | null = null;
  try {
    const { readFileSync } = await import('node:fs');
    const baselinePath = `${process.cwd()}/baseline.json`;
    const raw = readFileSync(baselinePath, 'utf-8');
    const baseline = JSON.parse(raw) as { summaryScores?: Record<string, number> };
    baselineScores = baseline.summaryScores ?? null;
  } catch {
    // No baseline file — fall back to pass rate check
  }

  if (baselineScores) {
    // Compare against stored baseline — detect regressions
    const regressions: Array<{ name: string; baseline: number; current: number; delta: number }> = [];
    for (const [name, currentAvg] of Object.entries(result.summaryScores)) {
      const baselineAvg = baselineScores[name];
      if (baselineAvg !== undefined) {
        const delta = currentAvg - baselineAvg;
        if (delta < -threshold) {
          regressions.push({ name, baseline: baselineAvg, current: currentAvg, delta });
        }
      }
    }

    if (regressions.length > 0) {
      console.error(`\nCI REGRESSION: ${regressions.length} grader(s) regressed vs baseline:`);
      for (const r of regressions) {
        console.error(`  ${r.name}: ${r.current.toFixed(4)} (baseline: ${r.baseline.toFixed(4)}, delta: ${r.delta.toFixed(4)})`);
      }
      process.exit(1);
    }

    console.log('\nCI: No regressions vs baseline. Pass.');
  } else {
    // No baseline — check absolute pass rate
    const failRate = result.totalCases > 0 ? result.failedCases / result.totalCases : 0;
    if (failRate > threshold) {
      console.error(`\nCI FAIL: ${result.failedCases}/${result.totalCases} cases failed (${(failRate * 100).toFixed(1)}%)`);
      process.exit(1);
    }

    console.log(`\nCI: ${result.passedCases}/${result.totalCases} passed. No baseline found — consider saving one with 'agentsy eval run --save-baseline'.`);
  }
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
          return numericThreshold(g.config as unknown as Parameters<typeof numericThreshold>[0]);
        case 'embedding_similarity':
          return embeddingSimilarity(g.config as unknown as Parameters<typeof embeddingSimilarity>[0]);
        case 'tool_name_match':
          return toolNameMatch(g.config as unknown as Parameters<typeof toolNameMatch>[0]);
        case 'tool_args_match':
          return toolArgsMatch();
        case 'llm_judge':
          return llmJudge(g.config as unknown as Parameters<typeof llmJudge>[0]);
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

/**
 * Run an experiment remotely via the Agentsy API.
 * Requires AGENTSY_API_KEY and AGENTSY_BASE_URL environment variables.
 */
async function runRemoteExperiment(
  experiment: import('@agentsy/eval').ExperimentDefinition,
  config: Record<string, unknown>,
): Promise<ExperimentResult> {
  const apiKey = process.env['AGENTSY_API_KEY'];
  const baseUrl = process.env['AGENTSY_BASE_URL'] ?? 'https://api.agentsy.com';

  if (!apiKey) {
    console.error('AGENTSY_API_KEY is required for --remote mode. Set it in .env or as an environment variable.');
    process.exit(1);
  }

  const agentSlug = (config.agent as Record<string, unknown> | undefined)?.slug as string | undefined
    ?? (config as Record<string, unknown>).slug as string | undefined;

  if (!agentSlug) {
    console.error('Agent slug not found in config. Cannot run remote experiment.');
    process.exit(1);
  }

  console.log(`Running remotely against ${baseUrl}...`);

  // Create experiment via API
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  // Resolve agent slug → agent_id and latest version_id via API
  const agentLookup = await fetch(`${baseUrl}/v1/agents?slug=${encodeURIComponent(agentSlug)}`, { headers });
  if (!agentLookup.ok) {
    console.error(`Failed to resolve agent "${agentSlug}": ${agentLookup.status}`);
    process.exit(1);
  }
  const agentList = (await agentLookup.json()) as { data: Array<{ id: string }> };
  if (!agentList.data?.[0]) {
    console.error(`Agent "${agentSlug}" not found on platform.`);
    process.exit(1);
  }
  const resolvedAgentId = agentList.data[0].id;

  // Resolve version — get latest
  const versionLookup = await fetch(`${baseUrl}/v1/agents/${resolvedAgentId}/versions?limit=1`, { headers });
  const versionList = versionLookup.ok
    ? ((await versionLookup.json()) as { data: Array<{ id: string }> })
    : { data: [] };
  const resolvedVersionId = versionList.data?.[0]?.id;
  if (!resolvedVersionId) {
    console.error(`No versions found for agent "${agentSlug}". Deploy first.`);
    process.exit(1);
  }

  // Resolve dataset name → dataset_id
  const datasetName = typeof experiment.dataset === 'string' ? experiment.dataset : experiment.dataset.name;
  const datasetLookup = await fetch(`${baseUrl}/v1/eval/datasets?name=${encodeURIComponent(datasetName)}`, { headers });
  if (!datasetLookup.ok) {
    console.error(`Failed to resolve dataset "${datasetName}": ${datasetLookup.status}`);
    process.exit(1);
  }
  const datasetList = (await datasetLookup.json()) as { data: Array<{ id: string }> };
  if (!datasetList.data?.[0]) {
    console.error(`Dataset "${datasetName}" not found on platform. Upload it first.`);
    process.exit(1);
  }
  const resolvedDatasetId = datasetList.data[0].id;

  const createRes = await fetch(`${baseUrl}/v1/eval/experiments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      agent_id: resolvedAgentId,
      version_id: resolvedVersionId,
      dataset_id: resolvedDatasetId,
      graders: experiment.graders.map((g) => ({ name: g.name, type: g.type, config: g.config })),
      tool_mode: experiment.toolMode ?? 'mock',
      parallelism: experiment.parallelism ?? 5,
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    console.error(`Failed to create remote experiment: ${createRes.status} ${errBody}`);
    process.exit(1);
  }

  const exp = await createRes.json() as { id: string; status: string };
  console.log(`Experiment created: ${exp.id} (status: ${exp.status})`);

  // Poll for completion
  const timeout = 600_000; // 10 min
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    await new Promise((r) => setTimeout(r, 2_000));
    const statusRes = await fetch(`${baseUrl}/v1/eval/experiments/${exp.id}`, { headers });
    const status = await statusRes.json() as { status: string; summary_scores: Record<string, number>; total_cases: number; passed_cases: number; failed_cases: number; total_cost_usd: number; total_duration_ms: number };

    if (['completed', 'failed'].includes(status.status)) {
      // Fetch per-case results
      const resultsRes = await fetch(`${baseUrl}/v1/eval/experiments/${exp.id}/results?limit=100`, { headers });
      const results = await resultsRes.json() as { data: Array<{ output: string; scores: Record<string, unknown>; passed: boolean; duration_ms: number; cost_usd: number; error?: string }> };

      return {
        name: exp.id,
        summaryScores: status.summary_scores,
        totalCases: status.total_cases,
        passedCases: status.passed_cases,
        failedCases: status.failed_cases,
        totalCostUsd: status.total_cost_usd,
        totalDurationMs: status.total_duration_ms ?? 0,
        caseResults: results.data.map((r, i) => ({
          caseIndex: i,
          input: '',
          output: r.output ?? '',
          scores: (r.scores ?? {}) as Record<string, import('@agentsy/eval').ScoreResult>,
          passed: r.passed,
          durationMs: r.duration_ms ?? 0,
          costUsd: r.cost_usd ?? 0,
          error: r.error,
        })),
      };
    }

    process.stdout.write('.');
  }

  console.error(`\nExperiment ${exp.id} timed out after ${timeout / 1000}s`);
  process.exit(1);
}
