import {
  evalDatasets,
  evalDatasetCases,
  runs,
  runSteps,
} from '@agentsy/db';
import type { RunInput, RunOutput } from '@agentsy/shared';
import { newId } from '@agentsy/shared';
import { eq, and, isNull, desc, lt, gt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { badRequest, notFound, conflict } from '../plugins/error-handler.js';

// ── Zod Schemas ─────────────────────────────────────────────────────

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

const createDatasetSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

const runInputSchema: z.ZodType<RunInput> = z.union([
  z.object({ type: z.literal('text'), text: z.string().min(1) }),
  z.object({
    type: z.literal('messages'),
    messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
  }),
  z.object({ type: z.literal('structured'), data: z.record(z.string(), z.unknown()) }),
]);

const expectedToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  order: z.number().optional(),
});

const mockedToolResultSchema = z.object({
  toolName: z.string(),
  argumentsMatch: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown(),
});

const trajectoryStepSchema = z.object({
  type: z.enum(['tool_call', 'response', 'approval_request']),
  toolName: z.string().optional(),
  contains: z.string().optional(),
});

const approvalExpectationSchema = z.object({
  shouldRequest: z.boolean(),
  toolName: z.string().optional(),
  action: z.enum(['approve', 'deny']).optional(),
});

const createCaseSchema = z.object({
  input: z.union([z.string().min(1), runInputSchema]),
  expected_output: z.union([
    z.string(),
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({
      type: z.literal('messages'),
      messages: z.array(z.object({ role: z.string(), content: z.string() })),
    }),
    z.object({ type: z.literal('structured'), data: z.record(z.string(), z.unknown()) }),
  ]).optional(),
  expected_tool_calls: z.array(expectedToolCallSchema).optional(),
  expected_trajectory: z.array(trajectoryStepSchema).optional(),
  expected_approval_behavior: approvalExpectationSchema.optional(),
  expected_citations: z.array(z.string()).optional(),
  expected_memory_writes: z.array(z.object({
    type: z.enum(['session_write', 'knowledge_update']),
    key: z.string().optional(),
    valueContains: z.string().optional(),
  })).optional(),
  mocked_tool_results: z.array(mockedToolResultSchema).optional(),
  session_history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const updateCaseSchema = z.object({
  input: z.union([z.string().min(1), runInputSchema]).optional(),
  expected_output: z.union([
    z.string(),
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({
      type: z.literal('messages'),
      messages: z.array(z.object({ role: z.string(), content: z.string() })),
    }),
    z.object({ type: z.literal('structured'), data: z.record(z.string(), z.unknown()) }),
  ]).nullable().optional(),
  expected_tool_calls: z.array(expectedToolCallSchema).nullable().optional(),
  expected_trajectory: z.array(trajectoryStepSchema).nullable().optional(),
  expected_approval_behavior: approvalExpectationSchema.nullable().optional(),
  expected_citations: z.array(z.string()).nullable().optional(),
  expected_memory_writes: z.array(z.object({
    type: z.enum(['session_write', 'knowledge_update']),
    key: z.string().optional(),
    valueContains: z.string().optional(),
  })).nullable().optional(),
  mocked_tool_results: z.array(mockedToolResultSchema).nullable().optional(),
  session_history: z.array(z.object({ role: z.string(), content: z.string() })).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

const fromRunSchema = z.object({
  run_id: z.string().min(1),
  expected_output: z.union([
    z.string(),
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({
      type: z.literal('messages'),
      messages: z.array(z.object({ role: z.string(), content: z.string() })),
    }),
    z.object({ type: z.literal('structured'), data: z.record(z.string(), z.unknown()) }),
  ]).optional(),
  expected_tool_calls: z.array(expectedToolCallSchema).optional(),
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

function formatDataset(d: {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  version: number;
  caseCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    org_id: d.orgId,
    name: d.name,
    description: d.description,
    version: d.version,
    case_count: d.caseCount,
    created_by: d.createdBy,
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}

function normalizeInput(input: string | RunInput): RunInput {
  if (typeof input === 'string') {
    return { type: 'text', text: input };
  }
  return input;
}

function normalizeOutput(output: string | RunOutput | undefined): RunOutput | undefined {
  if (output === undefined) return undefined;
  if (typeof output === 'string') {
    return { type: 'text', text: output };
  }
  return output;
}

function formatCase(c: typeof evalDatasetCases.$inferSelect) {
  return {
    id: c.id,
    dataset_id: c.datasetId,
    org_id: c.orgId,
    input: c.input,
    expected_output: c.expectedOutput,
    expected_tool_calls: c.expectedToolCalls,
    expected_trajectory: c.expectedTrajectory,
    expected_approval_behavior: c.expectedApprovalBehavior,
    expected_citations: c.expectedCitations,
    expected_memory_writes: c.expectedMemoryWrites,
    mocked_tool_results: c.mockedToolResults,
    session_history: c.sessionHistory,
    metadata: c.metadata,
    tags: c.tags,
    case_order: c.caseOrder,
    created_at: c.createdAt.toISOString(),
  };
}

// ── Dataset Routes ──────────────────────────────────────────────────

export function evalDatasetRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/eval/datasets — create dataset
  app.post('/v1/eval/datasets', async (request, reply) => {
    const orgId = request.orgId!;
    const body = createDatasetSchema.parse(request.body);

    // Check name uniqueness within org (latest version)
    const existing = await db
      .select({ id: evalDatasets.id })
      .from(evalDatasets)
      .where(
        and(eq(evalDatasets.orgId, orgId), eq(evalDatasets.name, body.name), isNull(evalDatasets.deletedAt)),
      )
      .limit(1);

    if (existing.length > 0) throw conflict(`Dataset with name "${body.name}" already exists`);

    const id = newId('eds');
    const now = new Date();

    await db.insert(evalDatasets).values({
      id,
      orgId,
      name: body.name,
      description: body.description ?? null,
      version: 1,
      caseCount: 0,
      createdBy: request.userId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    reply.status(201);
    return {
      id,
      org_id: orgId,
      name: body.name,
      description: body.description ?? null,
      version: 1,
      case_count: 0,
      created_by: request.userId ?? null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
  });

  // GET /v1/eval/datasets — list datasets
  app.get('/v1/eval/datasets', async (request) => {
    const orgId = request.orgId!;
    const query = request.query as Record<string, string>;
    const { limit, cursor, order } = paginationSchema.parse(query);

    const conditions = [eq(evalDatasets.orgId, orgId), isNull(evalDatasets.deletedAt)];

    // Optional name filter for lookup-by-name
    if (query['name']) {
      conditions.push(eq(evalDatasets.name, query['name']));
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(
          order === 'desc' ? lt(evalDatasets.id, decoded.id) : gt(evalDatasets.id, decoded.id),
        );
      }
    }

    const rows = await db
      .select()
      .from(evalDatasets)
      .where(and(...conditions))
      .orderBy(order === 'desc' ? desc(evalDatasets.createdAt) : evalDatasets.createdAt)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    return {
      data: data.map(formatDataset),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // GET /v1/eval/datasets/:dataset_id — get dataset
  app.get<{ Params: { dataset_id: string } }>('/v1/eval/datasets/:dataset_id', async (request) => {
    const orgId = request.orgId!;
    const result = await db
      .select()
      .from(evalDatasets)
      .where(
        and(
          eq(evalDatasets.id, request.params.dataset_id),
          eq(evalDatasets.orgId, orgId),
          isNull(evalDatasets.deletedAt),
        ),
      )
      .limit(1);

    if (!result[0]) throw notFound('Dataset not found');
    return formatDataset(result[0]);
  });

  // DELETE /v1/eval/datasets/:dataset_id — soft delete
  app.delete<{ Params: { dataset_id: string } }>(
    '/v1/eval/datasets/:dataset_id',
    async (request, reply) => {
      const orgId = request.orgId!;
      const result = await db
        .update(evalDatasets)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(evalDatasets.id, request.params.dataset_id),
            eq(evalDatasets.orgId, orgId),
            isNull(evalDatasets.deletedAt),
          ),
        )
        .returning({ id: evalDatasets.id });

      if (!result[0]) throw notFound('Dataset not found');
      reply.status(204);
      return;
    },
  );
}

// ── Case Routes ─────────────────────────────────────────────────────

export function evalCaseRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/eval/datasets/:dataset_id/cases — create case
  app.post<{ Params: { dataset_id: string } }>(
    '/v1/eval/datasets/:dataset_id/cases',
    async (request, reply) => {
      const orgId = request.orgId!;
      const body = createCaseSchema.parse(request.body);

      // Verify dataset exists
      const dataset = await db
        .select({ id: evalDatasets.id, caseCount: evalDatasets.caseCount })
        .from(evalDatasets)
        .where(
          and(
            eq(evalDatasets.id, request.params.dataset_id),
            eq(evalDatasets.orgId, orgId),
            isNull(evalDatasets.deletedAt),
          ),
        )
        .limit(1);

      if (!dataset[0]) throw notFound('Dataset not found');

      const id = newId('edc');
      const now = new Date();

      await db.insert(evalDatasetCases).values({
        id,
        datasetId: request.params.dataset_id,
        orgId,
        input: normalizeInput(body.input),
        expectedOutput: normalizeOutput(body.expected_output) ?? null,
        expectedToolCalls: body.expected_tool_calls ?? [],
        expectedTrajectory: body.expected_trajectory ?? [],
        expectedApprovalBehavior: body.expected_approval_behavior ?? null,
        expectedCitations: body.expected_citations ?? [],
        expectedMemoryWrites: body.expected_memory_writes ?? [],
        mockedToolResults: body.mocked_tool_results ?? [],
        sessionHistory: body.session_history ?? [],
        metadata: body.metadata ?? {},
        tags: body.tags ?? [],
        caseOrder: dataset[0].caseCount + 1,
        createdAt: now,
      });

      // Increment case_count
      await db
        .update(evalDatasets)
        .set({
          caseCount: sql`${evalDatasets.caseCount} + 1`,
          updatedAt: now,
        })
        .where(eq(evalDatasets.id, request.params.dataset_id));

      const inserted = await db
        .select()
        .from(evalDatasetCases)
        .where(eq(evalDatasetCases.id, id))
        .limit(1);

      reply.status(201);
      return formatCase(inserted[0]!);
    },
  );

  // POST /v1/eval/datasets/:dataset_id/cases/bulk — bulk upload
  app.post<{ Params: { dataset_id: string } }>(
    '/v1/eval/datasets/:dataset_id/cases/bulk',
    async (request, reply) => {
      const orgId = request.orgId!;
      const cases = z.array(createCaseSchema).min(1).max(1000).parse(request.body);

      // Verify dataset exists
      const dataset = await db
        .select({ id: evalDatasets.id, caseCount: evalDatasets.caseCount })
        .from(evalDatasets)
        .where(
          and(
            eq(evalDatasets.id, request.params.dataset_id),
            eq(evalDatasets.orgId, orgId),
            isNull(evalDatasets.deletedAt),
          ),
        )
        .limit(1);

      if (!dataset[0]) throw notFound('Dataset not found');

      const now = new Date();
      const startOrder = dataset[0].caseCount;

      const values = cases.map((c, i) => ({
        id: newId('edc'),
        datasetId: request.params.dataset_id,
        orgId,
        input: normalizeInput(c.input),
        expectedOutput: normalizeOutput(c.expected_output) ?? null,
        expectedToolCalls: c.expected_tool_calls ?? [],
        expectedTrajectory: c.expected_trajectory ?? [],
        expectedApprovalBehavior: c.expected_approval_behavior ?? null,
        expectedCitations: c.expected_citations ?? [],
        expectedMemoryWrites: c.expected_memory_writes ?? [],
        mockedToolResults: c.mocked_tool_results ?? [],
        sessionHistory: c.session_history ?? [],
        metadata: c.metadata ?? {},
        tags: c.tags ?? [],
        caseOrder: startOrder + i + 1,
        createdAt: now,
      }));

      await db.insert(evalDatasetCases).values(values);

      // Increment case_count by number of cases
      await db
        .update(evalDatasets)
        .set({
          caseCount: sql`${evalDatasets.caseCount} + ${cases.length}`,
          updatedAt: now,
        })
        .where(eq(evalDatasets.id, request.params.dataset_id));

      reply.status(201);
      return {
        created: cases.length,
        case_ids: values.map((v) => v.id),
      };
    },
  );

  // GET /v1/eval/datasets/:dataset_id/cases — list cases
  app.get<{ Params: { dataset_id: string } }>(
    '/v1/eval/datasets/:dataset_id/cases',
    async (request) => {
      const orgId = request.orgId!;
      const { limit, cursor, order } = paginationSchema.parse(request.query);

      // Verify dataset exists
      const dataset = await db
        .select({ id: evalDatasets.id })
        .from(evalDatasets)
        .where(
          and(
            eq(evalDatasets.id, request.params.dataset_id),
            eq(evalDatasets.orgId, orgId),
            isNull(evalDatasets.deletedAt),
          ),
        )
        .limit(1);

      if (!dataset[0]) throw notFound('Dataset not found');

      const conditions = [
        eq(evalDatasetCases.datasetId, request.params.dataset_id),
        eq(evalDatasetCases.orgId, orgId),
      ];

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          conditions.push(
            order === 'desc'
              ? lt(evalDatasetCases.id, decoded.id)
              : gt(evalDatasetCases.id, decoded.id),
          );
        }
      }

      const rows = await db
        .select()
        .from(evalDatasetCases)
        .where(and(...conditions))
        .orderBy(
          order === 'desc'
            ? desc(evalDatasetCases.caseOrder)
            : evalDatasetCases.caseOrder,
        )
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);

      return {
        data: data.map(formatCase),
        has_more: hasMore,
        next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
      };
    },
  );

  // GET /v1/eval/datasets/:dataset_id/cases/:case_id — get case
  app.get<{ Params: { dataset_id: string; case_id: string } }>(
    '/v1/eval/datasets/:dataset_id/cases/:case_id',
    async (request) => {
      const orgId = request.orgId!;

      const result = await db
        .select()
        .from(evalDatasetCases)
        .where(
          and(
            eq(evalDatasetCases.id, request.params.case_id),
            eq(evalDatasetCases.datasetId, request.params.dataset_id),
            eq(evalDatasetCases.orgId, orgId),
          ),
        )
        .limit(1);

      if (!result[0]) throw notFound('Case not found');
      return formatCase(result[0]);
    },
  );

  // PATCH /v1/eval/datasets/:dataset_id/cases/:case_id — update case
  app.patch<{ Params: { dataset_id: string; case_id: string } }>(
    '/v1/eval/datasets/:dataset_id/cases/:case_id',
    async (request) => {
      const orgId = request.orgId!;
      const body = updateCaseSchema.parse(request.body);

      const updates: Record<string, unknown> = {};
      if (body.input !== undefined) updates['input'] = normalizeInput(body.input);
      if (body.expected_output !== undefined) {
        updates['expectedOutput'] = body.expected_output === null
          ? null
          : normalizeOutput(body.expected_output);
      }
      if (body.expected_tool_calls !== undefined) {
        updates['expectedToolCalls'] = body.expected_tool_calls ?? [];
      }
      if (body.expected_trajectory !== undefined) {
        updates['expectedTrajectory'] = body.expected_trajectory ?? [];
      }
      if (body.expected_approval_behavior !== undefined) {
        updates['expectedApprovalBehavior'] = body.expected_approval_behavior;
      }
      if (body.expected_citations !== undefined) {
        updates['expectedCitations'] = body.expected_citations ?? [];
      }
      if (body.expected_memory_writes !== undefined) {
        updates['expectedMemoryWrites'] = body.expected_memory_writes ?? [];
      }
      if (body.mocked_tool_results !== undefined) {
        updates['mockedToolResults'] = body.mocked_tool_results ?? [];
      }
      if (body.session_history !== undefined) {
        updates['sessionHistory'] = body.session_history ?? [];
      }
      if (body.metadata !== undefined) {
        updates['metadata'] = body.metadata ?? {};
      }
      if (body.tags !== undefined) {
        updates['tags'] = body.tags ?? [];
      }

      if (Object.keys(updates).length === 0) {
        throw badRequest('No fields to update');
      }

      const result = await db
        .update(evalDatasetCases)
        .set(updates)
        .where(
          and(
            eq(evalDatasetCases.id, request.params.case_id),
            eq(evalDatasetCases.datasetId, request.params.dataset_id),
            eq(evalDatasetCases.orgId, orgId),
          ),
        )
        .returning();

      if (!result[0]) throw notFound('Case not found');
      return formatCase(result[0]);
    },
  );

  // DELETE /v1/eval/datasets/:dataset_id/cases/:case_id — delete case
  app.delete<{ Params: { dataset_id: string; case_id: string } }>(
    '/v1/eval/datasets/:dataset_id/cases/:case_id',
    async (request, reply) => {
      const orgId = request.orgId!;

      const result = await db
        .delete(evalDatasetCases)
        .where(
          and(
            eq(evalDatasetCases.id, request.params.case_id),
            eq(evalDatasetCases.datasetId, request.params.dataset_id),
            eq(evalDatasetCases.orgId, orgId),
          ),
        )
        .returning({ id: evalDatasetCases.id });

      if (!result[0]) throw notFound('Case not found');

      // Decrement case_count
      await db
        .update(evalDatasets)
        .set({
          caseCount: sql`GREATEST(${evalDatasets.caseCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(evalDatasets.id, request.params.dataset_id));

      reply.status(204);
      return;
    },
  );

  // POST /v1/eval/datasets/:dataset_id/cases/from-run — create case from run trace
  app.post<{ Params: { dataset_id: string } }>(
    '/v1/eval/datasets/:dataset_id/cases/from-run',
    async (request, reply) => {
      const orgId = request.orgId!;
      const body = fromRunSchema.parse(request.body);

      // Verify dataset exists
      const dataset = await db
        .select({ id: evalDatasets.id, caseCount: evalDatasets.caseCount })
        .from(evalDatasets)
        .where(
          and(
            eq(evalDatasets.id, request.params.dataset_id),
            eq(evalDatasets.orgId, orgId),
            isNull(evalDatasets.deletedAt),
          ),
        )
        .limit(1);

      if (!dataset[0]) throw notFound('Dataset not found');

      // Load run
      const run = await db
        .select()
        .from(runs)
        .where(and(eq(runs.id, body.run_id), eq(runs.orgId, orgId)))
        .limit(1);

      if (!run[0]) throw notFound('Run not found');

      // Load run steps
      const steps = await db
        .select()
        .from(runSteps)
        .where(eq(runSteps.runId, body.run_id))
        .orderBy(runSteps.stepOrder);

      // Extract tool calls from steps
      const toolCallSteps = steps.filter((s) => s.type === 'tool_call' && s.toolName);
      const extractedToolCalls = toolCallSteps.map((s) => ({
        name: s.toolName!,
        arguments: s.input ? parseJsonSafe(s.input) : undefined,
      }));
      const mockedToolResults = toolCallSteps.map((s) => ({
        toolName: s.toolName!,
        argumentsMatch: s.input ? parseJsonSafe(s.input) : undefined,
        result: s.output ? parseJsonSafe(s.output) : null,
      }));

      // Determine expected output
      const expectedOutput = body.expected_output
        ? normalizeOutput(body.expected_output)
        : run[0].output ?? undefined;

      const id = newId('edc');
      const now = new Date();

      await db.insert(evalDatasetCases).values({
        id,
        datasetId: request.params.dataset_id,
        orgId,
        input: run[0].input,
        expectedOutput: expectedOutput ?? null,
        expectedToolCalls: body.expected_tool_calls ?? extractedToolCalls,
        mockedToolResults,
        expectedTrajectory: [],
        expectedCitations: [],
        expectedMemoryWrites: [],
        sessionHistory: [],
        metadata: { source_run_id: body.run_id },
        tags: ['from-run'],
        caseOrder: dataset[0].caseCount + 1,
        createdAt: now,
      });

      // Increment case_count
      await db
        .update(evalDatasets)
        .set({
          caseCount: sql`${evalDatasets.caseCount} + 1`,
          updatedAt: now,
        })
        .where(eq(evalDatasets.id, request.params.dataset_id));

      const inserted = await db
        .select()
        .from(evalDatasetCases)
        .where(eq(evalDatasetCases.id, id))
        .limit(1);

      reply.status(201);
      return formatCase(inserted[0]!);
    },
  );
}

function parseJsonSafe(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
