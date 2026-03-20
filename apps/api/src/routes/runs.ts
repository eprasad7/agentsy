import {
  agents,
  agentVersions,
  deployments,
  environments,
  runs,
  runSteps,
  type RunMetadata,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import type { RunInput } from '@agentsy/shared';
import { eq, and, isNull, desc, lt, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { badRequest, notFound } from '../plugins/error-handler.js';
import { getTemporalClient } from '../lib/temporal.js';

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

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  agent_id: z.string().optional(),
  status: z.string().optional(),
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
    metadata: r.metadata,
    started_at: r.startedAt?.toISOString() ?? null,
    completed_at: r.completedAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
  };
}

function formatStep(s: typeof runSteps.$inferSelect) {
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
    const body = createRunSchema.parse(request.body);

    if (body.stream && body.async) {
      throw badRequest('stream and async are mutually exclusive');
    }

    // Verify agent exists
    const agentResult = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, request.params.agent_id), eq(agents.orgId, orgId), isNull(agents.deletedAt)))
      .limit(1);

    if (!agentResult[0]) throw notFound('Agent not found');

    // Resolve environment
    const envResult = await db
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.orgId, orgId), eq(environments.name, body.environment)))
      .limit(1);

    if (!envResult[0]) throw notFound(`Environment "${body.environment}" not found`);
    const environmentId = envResult[0].id;

    // Resolve version: explicit version_id → active deployment → latest version
    let versionId: string | null = null;
    if (body.version_id) {
      const verResult = await db
        .select({ id: agentVersions.id })
        .from(agentVersions)
        .where(and(eq(agentVersions.id, body.version_id), eq(agentVersions.agentId, request.params.agent_id)))
        .limit(1);
      if (!verResult[0]) throw notFound('Version not found');
      versionId = verResult[0].id;
    } else {
      // Try active deployment for this environment
      const depResult = await db
        .select({ versionId: deployments.versionId })
        .from(deployments)
        .where(
          and(
            eq(deployments.agentId, request.params.agent_id),
            eq(deployments.environmentId, environmentId),
            eq(deployments.status, 'active'),
          ),
        )
        .limit(1);

      if (depResult[0]) {
        versionId = depResult[0].versionId;
      } else {
        // Fall back to latest version
        const latestResult = await db
          .select({ id: agentVersions.id })
          .from(agentVersions)
          .where(eq(agentVersions.agentId, request.params.agent_id))
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

    await db.insert(runs).values({
      id: runId,
      orgId,
      agentId: request.params.agent_id,
      versionId,
      sessionId: body.session_id ?? null,
      environmentId,
      status: 'queued',
      input: normalizedInput,
      metadata,
      createdAt: now,
      updatedAt: now,
    });

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
            agentId: request.params.agent_id,
            versionId,
            orgId,
            input: normalizedInput,
            sessionId: body.session_id,
            environment: body.environment,
            environmentId,
          }],
        });

        // Store workflow ID
        await db
          .update(runs)
          .set({ temporalWorkflowId: workflowId })
          .where(eq(runs.id, runId));
      }
    } catch (err) {
      // Update run to failed if workflow start fails
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
        status: 'queued',
        poll_url: `/v1/runs/${runId}`,
      };
    }

    // Stream mode: SSE is Phase 3, fall back to sync
    // Sync mode: poll until complete (with timeout)
    const maxWaitMs = 300_000; // 5 min
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

    const result = await db
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
    const { limit, cursor, order, agent_id, status } = paginationSchema.parse(request.query);

    const conditions = [eq(runs.orgId, orgId)];
    if (agent_id) conditions.push(eq(runs.agentId, agent_id));
    if (status) conditions.push(eq(runs.status, status as typeof runs.status.enumValues[number]));

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(
          order === 'desc' ? lt(runs.id, decoded.id) : gt(runs.id, decoded.id),
        );
      }
    }

    const rows = await db
      .select()
      .from(runs)
      .where(and(...conditions))
      .orderBy(order === 'desc' ? desc(runs.createdAt) : runs.createdAt)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    return {
      data: data.map(formatRun),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // GET /v1/runs/:run_id/steps — get trace
  app.get<{ Params: { run_id: string } }>('/v1/runs/:run_id/steps', async (request) => {
    const orgId = request.orgId!;

    // Verify run exists and belongs to org
    const runResult = await db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.id, request.params.run_id), eq(runs.orgId, orgId)))
      .limit(1);

    if (!runResult[0]) throw notFound('Run not found');

    const steps = await db
      .select()
      .from(runSteps)
      .where(eq(runSteps.runId, request.params.run_id))
      .orderBy(runSteps.stepOrder);

    return { data: steps.map(formatStep) };
  });

  // POST /v1/runs/:run_id/cancel — cancel run
  app.post<{ Params: { run_id: string } }>('/v1/runs/:run_id/cancel', async (request) => {
    const orgId = request.orgId!;

    const result = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, request.params.run_id), eq(runs.orgId, orgId)))
      .limit(1);

    if (!result[0]) throw notFound('Run not found');

    if (['completed', 'failed', 'cancelled', 'timeout'].includes(result[0].status)) {
      throw badRequest(`Run is already ${result[0].status}`);
    }

    // Cancel Temporal workflow if exists
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

    await db
      .update(runs)
      .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(runs.id, request.params.run_id));

    return { id: request.params.run_id, status: 'cancelled' };
  });

  // POST /v1/runs/:run_id/approve — send approval signal
  app.post<{ Params: { run_id: string } }>('/v1/runs/:run_id/approve', async (request) => {
    const orgId = request.orgId!;

    const result = await db
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

    return { id: request.params.run_id, status: 'approved' };
  });

  // POST /v1/runs/:run_id/deny — send denial signal
  app.post<{ Params: { run_id: string } }>('/v1/runs/:run_id/deny', async (request) => {
    const orgId = request.orgId!;

    const result = await db
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
          await handle.signal('approval', { decision: 'denied', resolvedBy: request.userId });
        }
      } catch (err) {
        throw badRequest(`Failed to send denial signal: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return { id: request.params.run_id, status: 'denied' };
  });
}
