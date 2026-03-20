import {
  agents,
  agentVersions,
  deployments,
  environments,
  runs,
  type RunMetadata,
} from '@agentsy/db';
import type { RunInput } from '@agentsy/shared';
import { newId } from '@agentsy/shared';
import { runEventChannel, type RedisRunEvent } from '@agentsy/shared';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { getDb } from '../lib/request-db.js';
import { getTemporalClient } from '../lib/temporal.js';
import { badRequest, notFound, validationError } from '../plugins/error-handler.js';

// ── Schema ──────────────────────────────────────────────────────────

const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    tool_call_id: z.string().optional(),
    name: z.string().optional(),
  })).min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  tools: z.array(z.unknown()).optional(),
  agentsy: z.object({
    session_id: z.string().optional(),
    environment: z.string().optional(),
    version_id: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

// ── Routes ──────────────────────────────────────────────────────────

export function openaiCompatRoutes(app: FastifyInstance, db: DbClient): void {
  app.post('/v1/chat/completions', async (request, reply) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const body = chatCompletionSchema.parse(request.body);

    // Reject tools override
    if (body.tools?.length) {
      throw validationError(
        'Tool configuration is managed on the agent, not per-request. Remove the tools field.',
        [{ field: 'tools', message: 'Tools override is not supported', code: 'tools_override_not_supported' }],
      );
    }

    // Resolve agent from model field (slug or ID)
    const agentResult = await d
      .select({ id: agents.id, slug: agents.slug })
      .from(agents)
      .where(and(
        eq(body.model.startsWith('ag_') ? agents.id : agents.slug, body.model),
        eq(agents.orgId, orgId),
        isNull(agents.deletedAt),
      ))
      .limit(1);

    if (!agentResult[0]) throw notFound(`Agent "${body.model}" not found`);
    const agentId = agentResult[0].id;

    // Resolve environment
    const envName = (body.agentsy?.environment ?? 'production') as 'development' | 'staging' | 'production';
    const envResult = await d
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.orgId, orgId), eq(environments.name, envName)))
      .limit(1);

    if (!envResult[0]) throw notFound(`Environment "${envName}" not found`);

    // Resolve version
    let versionId: string | null = null;
    if (body.agentsy?.version_id) {
      versionId = body.agentsy.version_id;
    } else {
      const depResult = await d
        .select({ versionId: deployments.versionId })
        .from(deployments)
        .where(and(eq(deployments.agentId, agentId), eq(deployments.environmentId, envResult[0].id), eq(deployments.status, 'active')))
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
        if (latestResult[0]) versionId = latestResult[0].id;
      }
    }

    // Extract input from messages — use full messages array for context
    const lastUserMsg = [...body.messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) throw badRequest('At least one user message is required');

    // If there are prior messages, use the messages format for full context
    // Otherwise, just pass the text
    let normalizedInput: RunInput;
    if (body.messages.length > 1) {
      normalizedInput = {
        type: 'messages',
        messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      };
    } else {
      normalizedInput = { type: 'text', text: lastUserMsg.content };
    }

    // Create run
    const runId = newId('run');
    const now = new Date();
    const metadata: RunMetadata = {
      source: 'api',
      ...(body.agentsy?.metadata ?? {}),
      // Pass temperature/max_tokens overrides via metadata
      ...(body.temperature !== undefined ? { temperature_override: body.temperature } : {}),
      ...(body.max_tokens !== undefined ? { max_tokens_override: body.max_tokens } : {}),
    };

    await d.insert(runs).values({
      id: runId,
      orgId,
      agentId,
      versionId,
      sessionId: body.agentsy?.session_id ?? null,
      environmentId: envResult[0].id,
      status: 'queued',
      input: normalizedInput,
      metadata,
      createdAt: now,
      updatedAt: now,
    });

    // Commit the scoped transaction so the run row is visible to the worker
    if (request.scopedDb) {
      try {
        const { sql: sqlTag } = await import('drizzle-orm');
        await d.execute(sqlTag`COMMIT`);
      } catch { /* already committed */ }
    }

    // Post-commit: use shared pool for workflow start, polling, SSE
    try {
      const temporal = getTemporalClient();
      if (temporal) {
        const workflowId = `agent-run-${runId}`;
        await temporal.workflow.start('AgentRunWorkflow', {
          taskQueue: process.env['TEMPORAL_TASK_QUEUE'] ?? 'agentsy-agent-runs',
          workflowId,
          args: [{
            runId, agentId, versionId, orgId, input: normalizedInput,
            sessionId: body.agentsy?.session_id, environment: envName, environmentId: envResult[0].id,
          }],
        });
        await db.update(runs).set({ temporalWorkflowId: workflowId }).where(eq(runs.id, runId));
      }
    } catch (err) {
      await db.update(runs).set({
        status: 'failed', error: err instanceof Error ? err.message : 'Failed to start workflow',
        completedAt: new Date(), updatedAt: new Date(),
      }).where(eq(runs.id, runId));
    }

    // Streaming mode (OpenAI chunk format)
    if (body.stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const redisUrl = process.env['REDIS_URL'];
      if (!redisUrl) {
        writeOpenAIChunk(reply, runId, '', 'stop');
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
        return;
      }

      const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
      let closed = false;
      let model = 'unknown';
      let sentRole = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        subscriber.unsubscribe().catch(() => {});
        subscriber.disconnect();
      };

      reply.raw.on('close', cleanup);

      subscriber.on('message', (_ch: string, message: string) => {
        if (closed) return;
        try {
          const event = JSON.parse(message) as RedisRunEvent;

          if (event.type === 'run.started') {
            model = (event.data['model'] as string) ?? model;
            if (!sentRole) {
              writeOpenAIChunk(reply, runId, '', null, model, 'assistant');
              sentRole = true;
            }
          }

          if (event.type === 'step.text_delta') {
            const delta = (event.data['delta'] as string) ?? '';
            writeOpenAIChunk(reply, runId, delta, null, model);
          }

          if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) {
            writeOpenAIChunk(reply, runId, '', 'stop', model);
            reply.raw.write('data: [DONE]\n\n');
            reply.raw.end();
            cleanup();
          }
        } catch {
          // Skip malformed
        }
      });

      await subscriber.subscribe(runEventChannel(runId));
      return;
    }

    // Sync mode — poll for completion
    const maxWaitMs = 300_000;
    const pollInterval = 500;
    const startTime = Date.now();

    let result = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    while (
      result[0] && ['queued', 'running', 'awaiting_approval'].includes(result[0].status) &&
      Date.now() - startTime < maxWaitMs
    ) {
      await new Promise((r) => setTimeout(r, pollInterval));
      result = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    }

    if (!result[0]) throw notFound('Run not found');
    const run = result[0];

    const outputText = run.output && 'text' in run.output ? (run.output as { text: string }).text : '';

    return {
      id: run.id,
      object: 'chat.completion',
      created: Math.floor(run.createdAt.getTime() / 1000),
      model: run.model ?? 'unknown',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: outputText },
        finish_reason: run.status === 'completed' ? 'stop' : 'length',
      }],
      usage: {
        prompt_tokens: run.totalTokensIn,
        completion_tokens: run.totalTokensOut,
        total_tokens: run.totalTokensIn + run.totalTokensOut,
      },
      agentsy: {
        run_id: run.id,
        trace_id: run.traceId,
        session_id: run.sessionId,
        cost_usd: run.totalCostUsd,
        duration_ms: run.durationMs,
      },
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function writeOpenAIChunk(
  reply: { raw: { write: (s: string) => void } },
  runId: string,
  content: string,
  finishReason: string | null,
  model = 'unknown',
  role?: string,
) {
  const delta: Record<string, string> = {};
  if (role) delta['role'] = role;
  if (content) delta['content'] = content;

  const chunk = {
    id: runId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta,
      finish_reason: finishReason,
    }],
  };

  reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
