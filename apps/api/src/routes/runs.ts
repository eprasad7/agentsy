import {
  agents,
  agentVersions,
  deployments,
  environments,
  runs,
  runSteps,
  sessions,
  type RunMetadata,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import type { RunInput } from '@agentsy/shared';
import { eq, and, isNull, desc, lt, gt, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { getDb } from '../lib/request-db.js';
import { getTemporalClient } from '../lib/temporal.js';
import { badRequest, notFound } from '../plugins/error-handler.js';
import { handleSSEConnection } from '../streaming/sse-handler.js';

// ── Zod Schemas ─────────────────────────────────────────────────────

const runInputSchema = z.union([
  z.string().min(1),
  z.object({ type: z.literal('text'), text: z.string().min(1) }),
  z.object({
    type: z.literal('messages'),
    messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
  }),
  z.object({ type: z.literal('structured'), data: z.record(z.string(), z.unknown()) }),
]);

const createRunSchema = z.object({
  input: runInputSchema,
  session_id: z.string().optional(),
  version_id: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).optional().default('production'),
  stream: z.boolean().optional().default(false),
  async: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listRunsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  agent_id: z.string().optional(),
  status: z.string().optional(),
  environment: z.string().optional(),
  created_after: z.string().datetime().optional(),
  created_before: z.string().datetime().optional(),
});

const listStepsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

const approveSchema = z.object({
  step_id: z.string().optional(),
});

const denySchema = z.object({
  step_id: z.string().optional(),
  reason: z.string().optional(),
});

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeInput(input: string | RunInput): RunInput {
  if (typeof input === 'string') return { type: 'text', text: input };
  return input;
}

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

function formatRun(r: typeof runs.$inferSelect) {
  return {
    id: r.id,
    agent_id: r.agentId,
    version_id: r.versionId,
    session_id: r.sessionId,
    status: r.status,
    input: r.input,
    output: r.output,
    error: r.error,
    total_tokens_in: r.totalTokensIn,
    total_tokens_out: r.totalTokensOut,
    total_cost_usd: r.totalCostUsd,
    duration_ms: r.durationMs,
    model: r.model,
    trace_id: r.traceId,
    output_valid: r.outputValid ?? null,
    output_validation: r.outputValidation ?? null,
    metadata: r.metadata,
    started_at: r.startedAt?.toISOString() ?? null,
    completed_at: r.completedAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
  };
}

function formatStep(s: typeof runSteps.$inferSelect) {
  // Compute approval_wait_ms from timestamps
  let approvalWaitMs: number | null = null;
  if (s.approvalWaitStartedAt && s.approvalResolvedAt) {
    approvalWaitMs = s.approvalResolvedAt.getTime() - s.approvalWaitStartedAt.getTime();
  }

  return {
    id: s.id,
    run_id: s.runId,
    step_order: s.stepOrder,
    type: s.type,
    model: s.model,
    tool_name: s.toolName,
    input: s.input,
    output: s.output,
    tokens_in: s.tokensIn,
    tokens_out: s.tokensOut,
    cost_usd: s.costUsd,
    duration_ms: s.durationMs,
    error: s.error,
    output_truncated: s.outputTruncated,
    approval_status: s.approvalStatus,
    approved_by: s.approvalResolvedBy ?? null,
    approval_wait_ms: approvalWaitMs,
    parsed_output: s.parsedOutput ?? null,
    output_validation: s.outputValidation ?? null,
    metadata: s.metadata,
    started_at: s.startedAt?.toISOString() ?? null,
    completed_at: s.completedAt?.toISOString() ?? null,
    created_at: s.createdAt.toISOString(),
  };
}

// ── Routes ──────────────────────────────────────────────────────────

export function runRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/agents/:agent_id/run — start a run
  app.post<{ Params: { agent_id: string } }>('/v1/agents/:agent_id/run', async (request, reply) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const body = createRunSchema.parse(request.body);

    if (body.stream && body.async) {
      throw badRequest('stream and async are mutually exclusive');
    }

    // Resolve agent by ID or slug
    const agentParam = request.params.agent_id;
    const isId = agentParam.startsWith('ag_');
    const agentResult = await d
      .select({ id: agents.id })
      .from(agents)
      .where(and(
        isId ? eq(agents.id, agentParam) : eq(agents.slug, agentParam),
        eq(agents.orgId, orgId),
        isNull(agents.deletedAt),
      ))
      .limit(1);

    if (!agentResult[0]) throw notFound('Agent not found');
    const agentId = agentResult[0].id;

    // Validate session ownership (if session_id provided)
    if (body.session_id) {
      const sesResult = await d
        .select({ id: sessions.id, agentId: sessions.agentId })
        .from(sessions)
        .where(and(
          eq(sessions.id, body.session_id),
          eq(sessions.orgId, orgId),
          isNull(sessions.deletedAt),
        ))
        .limit(1);

      if (!sesResult[0]) throw notFound('Session not found');
      if (sesResult[0].agentId !== agentId) {
        throw badRequest('Session belongs to a different agent');
      }
    }

    // Resolve environment
    const envResult = await d
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.orgId, orgId), eq(environments.name, body.environment)))
      .limit(1);

    if (!envResult[0]) throw notFound(`Environment "${body.environment}" not found`);
    const environmentId = envResult[0].id;

    // Resolve version: explicit version_id → active deployment → latest version
    let versionId: string | null = null;
    if (body.version_id) {
      const verResult = await d
        .select({ id: agentVersions.id })
        .from(agentVersions)
        .where(and(eq(agentVersions.id, body.version_id), eq(agentVersions.agentId, agentId)))
        .limit(1);
      if (!verResult[0]) throw notFound('Version not found');
      versionId = verResult[0].id;
    } else {
      const depResult = await d
        .select({ versionId: deployments.versionId })
        .from(deployments)
        .where(
          and(
            eq(deployments.agentId, agentId),
            eq(deployments.environmentId, environmentId),
            eq(deployments.status, 'active'),
          ),
        )
        .limit(1);

      if (depResult[0]) {
        versionId = depResult[0].versionId;
      } else {
        const latestResult = await d
          .select({ id: agentVersions.id })
          .from(agentVersions)
          .where(eq(agentVersions.agentId, agentId))
          .orderBy(desc(agentVersions.version))
          .limit(1);
        if (latestResult[0]) {
          versionId = latestResult[0].id;
        }
      }
    }

    // Create run row
    const runId = newId('run');
    const normalizedInput = normalizeInput(body.input);
    const now = new Date();

    const metadata: RunMetadata = {
      source: 'api',
      ...(body.metadata ?? {}),
    };

    await d.insert(runs).values({
      id: runId,
      orgId,
      agentId,
      versionId,
      sessionId: body.session_id ?? null,
      environmentId,
      status: 'queued',
      input: normalizedInput,
      metadata,
      createdAt: now,
      updatedAt: now,
    });

    // Commit the scoped transaction NOW so the run row is visible to the
    // worker (which uses its own DB connection). The RLS middleware's
    // onResponse commit will be a harmless no-op.
    if (request.scopedDb) {
      try {
        const { sql: sqlTag } = await import('drizzle-orm');
        await d.execute(sqlTag`COMMIT`);
      } catch { /* already committed */ }
    }

    // From here, use the shared pool — the row is committed and visible
    // to all connections (worker, sync poller, SSE subscriber).

    // Start Temporal workflow
    try {
      const temporal = getTemporalClient();
      if (temporal) {
        const workflowId = `agent-run-${runId}`;
        await temporal.workflow.start('AgentRunWorkflow', {
          taskQueue: process.env['TEMPORAL_TASK_QUEUE'] ?? 'agentsy-agent-runs',
          workflowId,
          args: [{
            runId,
            agentId,
            versionId,
            orgId,
            input: normalizedInput,
            sessionId: body.session_id,
            environment: body.environment,
            environmentId,
          }],
        });

        await db
          .update(runs)
          .set({ temporalWorkflowId: workflowId })
          .where(eq(runs.id, runId));
      }
    } catch (err) {
      await db
        .update(runs)
        .set({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Failed to start workflow',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(runs.id, runId));
    }

    // Async mode: return 202 immediately
    if (body.async) {
      reply.status(202);
      return {
        id: runId,
        agent_id: agentId,
        status: 'queued',
        poll_url: `/v1/runs/${runId}`,
        created_at: now.toISOString(),
      };
    }

    // Stream mode: SSE via Redis pub/sub (long-lived, must not hold transaction)
    if (body.stream) {
      const lastEventId = request.headers['last-event-id'] as string | undefined;
      await handleSSEConnection(runId, reply, lastEventId);
      return;
    }

    // Sync mode: poll on shared pool until worker updates the row
    const maxWaitMs = 300_000;
    const pollInterval = 500;
    const startTime = Date.now();

    let result = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);

    while (
      result[0] &&
      ['queued', 'running', 'awaiting_approval'].includes(result[0].status) &&
      Date.now() - startTime < maxWaitMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      result = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    }

    if (!result[0]) throw notFound('Run not found');
    return formatRun(result[0]);
  });

  // GET /v1/runs/:run_id — get run
  app.get<{ Params: { run_id: string } }>('/v1/runs/:run_id', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);

    const result = await d
      .select()
      .from(runs)
      .where(and(eq(runs.id, request.params.run_id), eq(runs.orgId, orgId)))
      .limit(1);

    if (!result[0]) throw notFound('Run not found');
    return formatRun(result[0]);
  });

  // GET /v1/runs — list runs
  app.get('/v1/runs', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const query = listRunsSchema.parse(request.query);

    const conditions = [eq(runs.orgId, orgId)];
    if (query.agent_id) conditions.push(eq(runs.agentId, query.agent_id));
    if (query.status) conditions.push(eq(runs.status, query.status as typeof runs.status.enumValues[number]));
    if (query.environment) {
      const envName = query.environment as 'development' | 'staging' | 'production';
      const envRow = await d
        .select({ id: environments.id })
        .from(environments)
        .where(and(eq(environments.orgId, orgId), eq(environments.name, envName)))
        .limit(1);
      if (envRow[0]) {
        conditions.push(eq(runs.environmentId, envRow[0].id));
      }
    }
    if (query.created_after) {
      conditions.push(gte(runs.createdAt, new Date(query.created_after)));
    }
    if (query.created_before) {
      conditions.push(lte(runs.createdAt, new Date(query.created_before)));
    }

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (decoded) {
        conditions.push(
          query.order === 'desc' ? lt(runs.id, decoded.id) : gt(runs.id, decoded.id),
        );
      }
    }

    const rows = await d
      .select()
      .from(runs)
      .where(and(...conditions))
      .orderBy(query.order === 'desc' ? desc(runs.createdAt) : runs.createdAt)
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);

    return {
      data: data.map(formatRun),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // GET /v1/runs/:run_id/steps — get trace (with pagination)
  app.get<{ Params: { run_id: string } }>('/v1/runs/:run_id/steps', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const query = listStepsSchema.parse(request.query);

    const runResult = await d
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.id, request.params.run_id), eq(runs.orgId, orgId)))
      .limit(1);

    if (!runResult[0]) throw notFound('Run not found');

    const conditions = [eq(runSteps.runId, request.params.run_id)];

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (decoded) {
        conditions.push(gt(runSteps.id, decoded.id));
      }
    }

    const rows = await d
      .select()
      .from(runSteps)
      .where(and(...conditions))
      .orderBy(runSteps.stepOrder)
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);

    return {
      data: data.map(formatStep),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // POST /v1/runs/:run_id/cancel — cancel run
  app.post<{ Params: { run_id: string } }>('/v1/runs/:run_id/cancel', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);

    const result = await d
      .select()
      .from(runs)
      .where(and(eq(runs.id, request.params.run_id), eq(runs.orgId, orgId)))
      .limit(1);

    if (!result[0]) throw notFound('Run not found');

    if (['completed', 'failed', 'cancelled', 'timeout'].includes(result[0].status)) {
      throw badRequest(`Run is already ${result[0].status}`);
    }

    if (result[0].temporalWorkflowId) {
      try {
        const temporal = getTemporalClient();
        if (temporal) {
          const handle = temporal.workflow.getHandle(result[0].temporalWorkflowId);
          await handle.cancel();
        }
      } catch {
        // Workflow may already be completed
      }
    }

    const cancelledAt = new Date();
    await d
      .update(runs)
      .set({ status: 'cancelled', completedAt: cancelledAt, updatedAt: cancelledAt })
      .where(eq(runs.id, request.params.run_id));

    // Release concurrent run slot
    try {
      const { releaseRunSlot } = await import('../middleware/concurrent-run-limiter.js');
      await releaseRunSlot(orgId);
    } catch { /* non-critical */ }

    return {
      id: request.params.run_id,
      status: 'cancelled',
      cancelled_at: cancelledAt.toISOString(),
    };
  });

  // POST /v1/runs/:run_id/approve — send approval signal
  app.post<{ Params: { run_id: string } }>('/v1/runs/:run_id/approve', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const body = approveSchema.parse(request.body ?? {});

    const result = await d
      .select()
      .from(runs)
      .where(and(eq(runs.id, request.params.run_id), eq(runs.orgId, orgId)))
      .limit(1);

    if (!result[0]) throw notFound('Run not found');
    if (result[0].status !== 'awaiting_approval') {
      throw badRequest('Run is not awaiting approval');
    }

    if (result[0].temporalWorkflowId) {
      try {
        const temporal = getTemporalClient();
        if (temporal) {
          const handle = temporal.workflow.getHandle(result[0].temporalWorkflowId);
          await handle.signal('approval', { decision: 'approved', resolvedBy: request.userId });
        }
      } catch (err) {
        throw badRequest(`Failed to send approval signal: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return {
      id: request.params.run_id,
      step_id: body.step_id ?? null,
      status: 'approved',
    };
  });

  // POST /v1/runs/:run_id/deny — send denial signal
  app.post<{ Params: { run_id: string } }>('/v1/runs/:run_id/deny', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const body = denySchema.parse(request.body ?? {});

    const result = await d
      .select()
      .from(runs)
      .where(and(eq(runs.id, request.params.run_id), eq(runs.orgId, orgId)))
      .limit(1);

    if (!result[0]) throw notFound('Run not found');
    if (result[0].status !== 'awaiting_approval') {
      throw badRequest('Run is not awaiting approval');
    }

    if (result[0].temporalWorkflowId) {
      try {
        const temporal = getTemporalClient();
        if (temporal) {
          const handle = temporal.workflow.getHandle(result[0].temporalWorkflowId);
          await handle.signal('approval', { decision: 'denied', resolvedBy: request.userId, reason: body.reason });
        }
      } catch (err) {
        throw badRequest(`Failed to send denial signal: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return {
      id: request.params.run_id,
      step_id: body.step_id ?? null,
      status: 'denied',
      reason: body.reason ?? null,
    };
  });
}
