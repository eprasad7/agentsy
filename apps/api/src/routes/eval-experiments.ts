import {
  evalExperiments,
  evalExperimentResults,
  evalBaselines,
  evalDatasets,
  agents,
  agentVersions,
  type ExperimentConfig,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq, and, desc, lt, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { getTemporalClient } from '../lib/temporal.js';
import { badRequest, notFound } from '../plugins/error-handler.js';

// ── Zod Schemas ─────────────────────────────────────────────────────

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

const createExperimentSchema = z.object({
  dataset_id: z.string().min(1),
  agent_id: z.string().min(1),
  version_id: z.string().min(1),
  name: z.string().max(255).optional(),
  // Top-level fields per spec-api.md §7.11
  graders: z.array(z.object({
    name: z.string(),
    type: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  tool_mode: z.enum(['mock', 'dry-run', 'live']).optional().default('mock'),
  parallelism: z.coerce.number().int().min(1).max(20).optional().default(5),
  judge_model: z.string().optional(),
  commit_sha: z.string().max(40).optional(),
  pr_number: z.coerce.number().int().optional(),
  ci_run_url: z.string().max(500).optional(),
});

const listExperimentsSchema = paginationSchema.extend({
  agent_id: z.string().optional(),
  dataset_id: z.string().optional(),
  status: z.string().optional(),
});

const setBaselineSchema = z.object({
  experiment_id: z.string().min(1),
});

// ── Helpers ─────────────────────────────────────────────────────────

function decodeCursor(cursor: string): { id: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { id: string };
  } catch {
    return null;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id })).toString('base64url');
}

function formatExperiment(e: typeof evalExperiments.$inferSelect) {
  return {
    id: e.id,
    org_id: e.orgId,
    dataset_id: e.datasetId,
    agent_id: e.agentId,
    version_id: e.versionId,
    name: e.name,
    status: e.status,
    summary_scores: e.summaryScores,
    total_cases: e.totalCases,
    passed_cases: e.passedCases,
    failed_cases: e.failedCases,
    total_cost_usd: e.totalCostUsd,
    total_duration_ms: e.totalDurationMs,
    config: e.config,
    error: e.error,
    commit_sha: e.commitSha,
    pr_number: e.prNumber,
    ci_run_url: e.ciRunUrl,
    started_at: e.startedAt?.toISOString() ?? null,
    completed_at: e.completedAt?.toISOString() ?? null,
    created_by: e.createdBy,
    created_at: e.createdAt.toISOString(),
    updated_at: e.updatedAt.toISOString(),
  };
}

function formatResult(r: typeof evalExperimentResults.$inferSelect) {
  return {
    id: r.id,
    experiment_id: r.experimentId,
    case_id: r.caseId,
    org_id: r.orgId,
    run_id: r.runId,
    output: r.output,
    scores: r.scores,
    passed: r.passed,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    error: r.error,
    created_at: r.createdAt.toISOString(),
  };
}

function formatBaseline(b: typeof evalBaselines.$inferSelect) {
  return {
    id: b.id,
    org_id: b.orgId,
    agent_id: b.agentId,
    dataset_id: b.datasetId,
    experiment_id: b.experimentId,
    version_id: b.versionId,
    summary_scores: b.summaryScores,
    per_case_scores: b.perCaseScores,
    is_active: b.isActive,
    set_by: b.setBy,
    created_at: b.createdAt.toISOString(),
  };
}

// ── Experiment Routes ───────────────────────────────────────────────

export function evalExperimentRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/eval/experiments — start experiment
  app.post('/v1/eval/experiments', async (request, reply) => {
    const orgId = request.orgId!;
    const body = createExperimentSchema.parse(request.body);

    // Verify dataset exists
    const dataset = await db
      .select({ id: evalDatasets.id, caseCount: evalDatasets.caseCount })
      .from(evalDatasets)
      .where(and(eq(evalDatasets.id, body.dataset_id), eq(evalDatasets.orgId, orgId)))
      .limit(1);

    if (!dataset[0]) throw notFound('Dataset not found');
    if (dataset[0].caseCount === 0) throw badRequest('Dataset has no cases');

    // Verify agent + version exist
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, body.agent_id), eq(agents.orgId, orgId)))
      .limit(1);

    if (!agent[0]) throw notFound('Agent not found');

    const version = await db
      .select({ id: agentVersions.id })
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, body.version_id),
          eq(agentVersions.agentId, body.agent_id),
          eq(agentVersions.orgId, orgId),
        ),
      )
      .limit(1);

    if (!version[0]) throw notFound('Agent version not found');

    const id = newId('exp');
    const now = new Date();

    const config: ExperimentConfig = {
      toolMode: body.tool_mode,
      graders: body.graders,
      parallelism: body.parallelism,
      judgeModel: body.judge_model,
    };

    await db.insert(evalExperiments).values({
      id,
      orgId,
      datasetId: body.dataset_id,
      agentId: body.agent_id,
      versionId: body.version_id,
      name: body.name ?? null,
      status: 'queued',
      totalCases: dataset[0].caseCount,
      config,
      commitSha: body.commit_sha ?? null,
      prNumber: body.pr_number ?? null,
      ciRunUrl: body.ci_run_url ?? null,
      createdBy: request.userId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // Resolve environment for eval runs (use development by default)
    const { environments } = await import('@agentsy/db');
    const envRow = await db
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.orgId, orgId), eq(environments.name, 'development')))
      .limit(1);
    const environmentId = envRow[0]?.id ?? '';

    // Start Temporal workflow (best-effort — if Temporal is unavailable, experiment stays queued)
    try {
      const temporal = getTemporalClient();
      if (temporal) {
        await temporal.workflow.start('EvalExperimentWorkflow', {
          taskQueue: process.env['TEMPORAL_TASK_QUEUE'] ?? 'agentsy-agent-runs',
          workflowId: `eval-${id}`,
          args: [
            {
              experimentId: id,
              datasetId: body.dataset_id,
              agentId: body.agent_id,
              versionId: body.version_id,
              orgId,
              environmentId,
              config,
            },
          ],
        });
      }
    } catch {
      // Temporal not available — experiment stays queued
    }

    const result = await db
      .select()
      .from(evalExperiments)
      .where(eq(evalExperiments.id, id))
      .limit(1);

    reply.status(202);
    return formatExperiment(result[0]!);
  });

  // GET /v1/eval/experiments — list experiments
  app.get('/v1/eval/experiments', async (request) => {
    const orgId = request.orgId!;
    const { limit, cursor, order, agent_id, dataset_id, status } = listExperimentsSchema.parse(
      request.query,
    );

    const conditions = [eq(evalExperiments.orgId, orgId)];

    if (agent_id) conditions.push(eq(evalExperiments.agentId, agent_id));
    if (dataset_id) conditions.push(eq(evalExperiments.datasetId, dataset_id));
    if (status) conditions.push(eq(evalExperiments.status, status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'));

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(
          order === 'desc'
            ? lt(evalExperiments.id, decoded.id)
            : gt(evalExperiments.id, decoded.id),
        );
      }
    }

    const rows = await db
      .select()
      .from(evalExperiments)
      .where(and(...conditions))
      .orderBy(order === 'desc' ? desc(evalExperiments.createdAt) : evalExperiments.createdAt)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    return {
      data: data.map(formatExperiment),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // GET /v1/eval/experiments/:id — get experiment
  app.get<{ Params: { id: string } }>('/v1/eval/experiments/:id', async (request) => {
    const orgId = request.orgId!;

    const result = await db
      .select()
      .from(evalExperiments)
      .where(and(eq(evalExperiments.id, request.params.id), eq(evalExperiments.orgId, orgId)))
      .limit(1);

    if (!result[0]) throw notFound('Experiment not found');
    return formatExperiment(result[0]);
  });

  // GET /v1/eval/experiments/:id/results — per-case results
  app.get<{ Params: { id: string } }>('/v1/eval/experiments/:id/results', async (request) => {
    const orgId = request.orgId!;
    const { limit, cursor, order } = paginationSchema.parse(request.query);

    // Verify experiment exists
    const experiment = await db
      .select({ id: evalExperiments.id })
      .from(evalExperiments)
      .where(and(eq(evalExperiments.id, request.params.id), eq(evalExperiments.orgId, orgId)))
      .limit(1);

    if (!experiment[0]) throw notFound('Experiment not found');

    const conditions = [
      eq(evalExperimentResults.experimentId, request.params.id),
      eq(evalExperimentResults.orgId, orgId),
    ];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(
          order === 'desc'
            ? lt(evalExperimentResults.id, decoded.id)
            : gt(evalExperimentResults.id, decoded.id),
        );
      }
    }

    const rows = await db
      .select()
      .from(evalExperimentResults)
      .where(and(...conditions))
      .orderBy(
        order === 'desc'
          ? desc(evalExperimentResults.createdAt)
          : evalExperimentResults.createdAt,
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    return {
      data: data.map(formatResult),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // GET /v1/eval/experiments/compare — compare two experiments
  app.get('/v1/eval/experiments/compare', async (request) => {
    const orgId = request.orgId!;
    const { experiment_a, experiment_b } = z
      .object({
        experiment_a: z.string().min(1),
        experiment_b: z.string().min(1),
      })
      .parse(request.query);

    // Load both experiments
    const [expA, expB] = await Promise.all([
      db
        .select()
        .from(evalExperiments)
        .where(and(eq(evalExperiments.id, experiment_a), eq(evalExperiments.orgId, orgId)))
        .limit(1),
      db
        .select()
        .from(evalExperiments)
        .where(and(eq(evalExperiments.id, experiment_b), eq(evalExperiments.orgId, orgId)))
        .limit(1),
    ]);

    if (!expA[0]) throw notFound('Experiment A not found');
    if (!expB[0]) throw notFound('Experiment B not found');

    // Load per-case results for both
    const [resultsA, resultsB] = await Promise.all([
      db
        .select()
        .from(evalExperimentResults)
        .where(eq(evalExperimentResults.experimentId, experiment_a)),
      db
        .select()
        .from(evalExperimentResults)
        .where(eq(evalExperimentResults.experimentId, experiment_b)),
    ]);

    // Index results by case_id
    const resultsByCaseA = new Map(resultsA.map((r) => [r.caseId, r]));
    const resultsByCaseB = new Map(resultsB.map((r) => [r.caseId, r]));

    // Match cases and compute deltas
    const allCaseIds = new Set([...resultsByCaseA.keys(), ...resultsByCaseB.keys()]);
    const perCaseDiffs: Array<{
      case_id: string;
      scores_a: Record<string, number>;
      scores_b: Record<string, number>;
      deltas: Record<string, number>;
      classification: 'improved' | 'regressed' | 'unchanged' | 'new' | 'removed';
    }> = [];

    let improved = 0;
    let regressed = 0;
    let unchanged = 0;

    for (const caseId of allCaseIds) {
      const rA = resultsByCaseA.get(caseId);
      const rB = resultsByCaseB.get(caseId);

      if (!rA && rB) {
        perCaseDiffs.push({
          case_id: caseId,
          scores_a: {},
          scores_b: extractScoreValues(rB.scores),
          deltas: {},
          classification: 'new',
        });
        continue;
      }
      if (rA && !rB) {
        perCaseDiffs.push({
          case_id: caseId,
          scores_a: extractScoreValues(rA.scores),
          scores_b: {},
          deltas: {},
          classification: 'removed',
        });
        continue;
      }

      const scoresA = extractScoreValues(rA!.scores);
      const scoresB = extractScoreValues(rB!.scores);
      const deltas: Record<string, number> = {};

      const allGraders = new Set([...Object.keys(scoresA), ...Object.keys(scoresB)]);
      let maxDelta = 0;
      for (const grader of allGraders) {
        const a = scoresA[grader] ?? 0;
        const b = scoresB[grader] ?? 0;
        deltas[grader] = Number((b - a).toFixed(4));
        if (Math.abs(deltas[grader]!) > Math.abs(maxDelta)) {
          maxDelta = deltas[grader]!;
        }
      }

      let classification: 'improved' | 'regressed' | 'unchanged';
      if (maxDelta > 0.05) {
        classification = 'improved';
        improved++;
      } else if (maxDelta < -0.05) {
        classification = 'regressed';
        regressed++;
      } else {
        classification = 'unchanged';
        unchanged++;
      }

      perCaseDiffs.push({ case_id: caseId, scores_a: scoresA, scores_b: scoresB, deltas, classification });
    }

    // Summary deltas
    const summaryDeltas: Record<string, number> = {};
    const summaryA = expA[0].summaryScores ?? {};
    const summaryB = expB[0].summaryScores ?? {};
    const allSummaryGraders = new Set([...Object.keys(summaryA), ...Object.keys(summaryB)]);
    for (const grader of allSummaryGraders) {
      summaryDeltas[grader] = Number(((summaryB[grader] ?? 0) - (summaryA[grader] ?? 0)).toFixed(4));
    }

    return {
      experiment_a: formatExperiment(expA[0]),
      experiment_b: formatExperiment(expB[0]),
      summary_deltas: summaryDeltas,
      improved,
      regressed,
      unchanged,
      per_case_diffs: perCaseDiffs,
    };
  });
}

function extractScoreValues(
  scores: Record<string, { score: number; name: string; graderType: string; reasoning?: string }> | null,
): Record<string, number> {
  if (!scores) return {};
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(scores)) {
    result[key] = val.score;
  }
  return result;
}

// ── Baseline Routes ─────────────────────────────────────────────────

export function evalBaselineRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/eval/baselines — set baseline from experiment
  app.post('/v1/eval/baselines', async (request, reply) => {
    const orgId = request.orgId!;
    const body = setBaselineSchema.parse(request.body);

    // Load experiment
    const experiment = await db
      .select()
      .from(evalExperiments)
      .where(and(eq(evalExperiments.id, body.experiment_id), eq(evalExperiments.orgId, orgId)))
      .limit(1);

    if (!experiment[0]) throw notFound('Experiment not found');
    if (experiment[0].status !== 'completed') {
      throw badRequest('Only completed experiments can be set as baselines');
    }

    // Load per-case results to build per_case_scores
    const results = await db
      .select()
      .from(evalExperimentResults)
      .where(eq(evalExperimentResults.experimentId, body.experiment_id));

    const perCaseScores: Record<string, Record<string, number>> = {};
    for (const r of results) {
      perCaseScores[r.caseId] = extractScoreValues(r.scores);
    }

    // Deactivate existing active baseline for this agent+dataset
    await db
      .update(evalBaselines)
      .set({ isActive: false })
      .where(
        and(
          eq(evalBaselines.agentId, experiment[0].agentId),
          eq(evalBaselines.datasetId, experiment[0].datasetId),
          eq(evalBaselines.orgId, orgId),
          eq(evalBaselines.isActive, true),
        ),
      );

    const id = newId('ebl');
    const now = new Date();

    await db.insert(evalBaselines).values({
      id,
      orgId,
      agentId: experiment[0].agentId,
      datasetId: experiment[0].datasetId,
      experimentId: body.experiment_id,
      versionId: experiment[0].versionId,
      summaryScores: experiment[0].summaryScores ?? {},
      perCaseScores,
      isActive: true,
      setBy: request.userId ?? null,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(evalBaselines)
      .where(eq(evalBaselines.id, id))
      .limit(1);

    reply.status(201);
    return formatBaseline(result[0]!);
  });

  // GET /v1/eval/baselines/active — get active baseline
  app.get('/v1/eval/baselines/active', async (request) => {
    const orgId = request.orgId!;
    const { agent_id, dataset_id } = z
      .object({
        agent_id: z.string().min(1),
        dataset_id: z.string().min(1),
      })
      .parse(request.query);

    const result = await db
      .select()
      .from(evalBaselines)
      .where(
        and(
          eq(evalBaselines.agentId, agent_id),
          eq(evalBaselines.datasetId, dataset_id),
          eq(evalBaselines.orgId, orgId),
          eq(evalBaselines.isActive, true),
        ),
      )
      .limit(1);

    if (!result[0]) throw notFound('No active baseline found');
    return formatBaseline(result[0]);
  });
}
