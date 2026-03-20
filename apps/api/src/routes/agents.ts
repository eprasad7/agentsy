import {
  agents,
  agentVersions,
  type VersionModelSpec,
  type VersionToolsConfig,
  type VersionGuardrailsConfig,
  type VersionModelParams,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq, and, isNull, desc, lt, gt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { notFound, validationError, conflict } from '../plugins/error-handler.js';

// ── Zod Schemas ─────────────────────────────────────────────────────

const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  description: z.string().max(2000).optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ── Helpers ─────────────────────────────────────────────────────────

function formatAgent(a: {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    org_id: a.orgId,
    name: a.name,
    slug: a.slug,
    description: a.description,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
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

// ── Routes ──────────────────────────────────────────────────────────

export function agentRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/agents — create agent
  app.post('/v1/agents', async (request, reply) => {
    const orgId = request.orgId!;
    const body = createAgentSchema.parse(request.body);

    // Check slug uniqueness within org
    const existing = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.orgId, orgId), eq(agents.slug, body.slug), isNull(agents.deletedAt)))
      .limit(1);

    if (existing.length > 0) throw conflict(`Agent with slug "${body.slug}" already exists`);

    const id = newId('ag');
    const now = new Date();

    await db.insert(agents).values({
      id,
      orgId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      createdAt: now,
      updatedAt: now,
    });

    reply.status(201);
    return {
      id,
      org_id: orgId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
  });

  // GET /v1/agents — list agents
  app.get('/v1/agents', async (request) => {
    const orgId = request.orgId!;
    const { limit, cursor, order } = paginationSchema.parse(request.query);

    const conditions = [eq(agents.orgId, orgId), isNull(agents.deletedAt)];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(
          order === 'desc' ? lt(agents.id, decoded.id) : gt(agents.id, decoded.id),
        );
      }
    }

    const rows = await db
      .select()
      .from(agents)
      .where(and(...conditions))
      .orderBy(order === 'desc' ? desc(agents.createdAt) : agents.createdAt)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    return {
      data: data.map(formatAgent),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // GET /v1/agents/:agent_id — get agent
  app.get<{ Params: { agent_id: string } }>('/v1/agents/:agent_id', async (request) => {
    const orgId = request.orgId!;
    const result = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, request.params.agent_id), eq(agents.orgId, orgId), isNull(agents.deletedAt)))
      .limit(1);

    if (!result[0]) throw notFound('Agent not found');
    return formatAgent(result[0]);
  });

  // PATCH /v1/agents/:agent_id — update agent
  app.patch<{ Params: { agent_id: string } }>('/v1/agents/:agent_id', async (request) => {
    const orgId = request.orgId!;
    const body = updateAgentSchema.parse(request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates['name'] = body.name;
    if (body.description !== undefined) updates['description'] = body.description;

    if (Object.keys(updates).length <= 1) {
      throw validationError('No fields to update');
    }

    const result = await db
      .update(agents)
      .set(updates)
      .where(and(eq(agents.id, request.params.agent_id), eq(agents.orgId, orgId), isNull(agents.deletedAt)))
      .returning();

    if (!result[0]) throw notFound('Agent not found');
    return formatAgent(result[0]);
  });

  // DELETE /v1/agents/:agent_id — soft delete
  app.delete<{ Params: { agent_id: string } }>('/v1/agents/:agent_id', async (request, reply) => {
    const orgId = request.orgId!;
    const result = await db
      .update(agents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agents.id, request.params.agent_id), eq(agents.orgId, orgId), isNull(agents.deletedAt)))
      .returning({ id: agents.id });

    if (!result[0]) throw notFound('Agent not found');
    reply.status(204);
    return;
  });
}

// ── Agent Versions Routes ───────────────────────────────────────────

const createVersionSchema = z.object({
  system_prompt: z.string().min(1),
  model: z.union([
    z.string().min(1).max(100),
    z.object({
      class: z.enum(['reasoning', 'balanced', 'fast']),
      provider: z.enum(['anthropic', 'openai']).optional(),
    }),
  ]),
  fallback_model: z.string().min(1).max(100).optional(),
  tools_config: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  guardrails_config: z.record(z.string(), z.unknown()).optional().default({}),
  model_params: z.record(z.string(), z.unknown()).optional().default({}),
  output_config: z.object({
    mode: z.enum(['text', 'json']),
    json_schema: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
    schema_version: z.string().optional(),
  }).optional().default({ mode: 'text' }),
  description: z.string().max(2000).optional(),
});

function formatVersion(v: {
  id: string;
  agentId: string;
  orgId: string;
  version: number;
  systemPrompt: string;
  model: string;
  modelSpec: unknown;
  fallbackModel: string | null;
  toolsConfig: unknown;
  guardrailsConfig: unknown;
  modelParams: unknown;
  outputConfig: unknown;
  description: string | null;
  createdBy: string | null;
  createdAt: Date;
}) {
  return {
    id: v.id,
    agent_id: v.agentId,
    org_id: v.orgId,
    version: v.version,
    system_prompt: v.systemPrompt,
    model: v.model,
    model_spec: v.modelSpec,
    fallback_model: v.fallbackModel,
    tools_config: v.toolsConfig,
    guardrails_config: v.guardrailsConfig,
    model_params: v.modelParams,
    output_config: v.outputConfig ?? { mode: 'text' },
    description: v.description,
    created_by: v.createdBy,
    created_at: v.createdAt.toISOString(),
  };
}

export function agentVersionRoutes(app: FastifyInstance, db: DbClient): void {
  // GET /v1/agents/:agent_id/versions — list versions
  app.get<{ Params: { agent_id: string } }>('/v1/agents/:agent_id/versions', async (request) => {
    const orgId = request.orgId!;
    const { limit, cursor, order } = paginationSchema.parse(request.query);

    // Verify agent exists and belongs to org
    const agentResult = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, request.params.agent_id), eq(agents.orgId, orgId), isNull(agents.deletedAt)))
      .limit(1);

    if (!agentResult[0]) throw notFound('Agent not found');

    const conditions = [
      eq(agentVersions.agentId, request.params.agent_id),
      eq(agentVersions.orgId, orgId),
    ];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(
          order === 'desc' ? lt(agentVersions.id, decoded.id) : gt(agentVersions.id, decoded.id),
        );
      }
    }

    const rows = await db
      .select()
      .from(agentVersions)
      .where(and(...conditions))
      .orderBy(order === 'desc' ? desc(agentVersions.version) : agentVersions.version)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    return {
      data: data.map(formatVersion),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // POST /v1/agents/:agent_id/versions — create version
  app.post<{ Params: { agent_id: string } }>('/v1/agents/:agent_id/versions', async (request, reply) => {
    const orgId = request.orgId!;
    const body = createVersionSchema.parse(request.body);

    // Verify agent exists
    const agentResult = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, request.params.agent_id), eq(agents.orgId, orgId), isNull(agents.deletedAt)))
      .limit(1);

    if (!agentResult[0]) throw notFound('Agent not found');

    // Get next version number
    const maxVersionResult = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${agentVersions.version}), 0)` })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, request.params.agent_id));

    const nextVersion = (maxVersionResult[0]?.maxVersion ?? 0) + 1;

    // Resolve model string and spec
    let modelString: string;
    let modelSpec: VersionModelSpec;
    if (typeof body.model === 'string') {
      modelString = body.model;
      modelSpec = { type: 'direct', model: body.model };
    } else {
      const { CAPABILITY_CLASS_MODELS } = await import('@agentsy/shared');
      const classKey = body.model.class === 'reasoning' ? 'powerful' : body.model.class;
      const provider = body.model.provider ?? 'anthropic';
      modelString = CAPABILITY_CLASS_MODELS[classKey]?.[provider] ?? body.model.class;
      modelSpec = { type: 'class', class: body.model.class, provider: body.model.provider };
    }

    const id = newId('ver');

    const row = await db
      .insert(agentVersions)
      .values({
        id,
        agentId: request.params.agent_id,
        orgId,
        version: nextVersion,
        systemPrompt: body.system_prompt,
        model: modelString,
        modelSpec,
        fallbackModel: body.fallback_model ?? null,
        toolsConfig: body.tools_config as VersionToolsConfig,
        guardrailsConfig: body.guardrails_config as VersionGuardrailsConfig,
        modelParams: body.model_params as VersionModelParams,
        outputConfig: body.output_config,
        description: body.description ?? null,
        createdBy: request.userId ?? null,
      })
      .returning();

    reply.status(201);
    return formatVersion(row[0]!);
  });

  // GET /v1/agents/:agent_id/versions/:version_id — get version
  app.get<{ Params: { agent_id: string; version_id: string } }>(
    '/v1/agents/:agent_id/versions/:version_id',
    async (request) => {
      const orgId = request.orgId!;

      const result = await db
        .select()
        .from(agentVersions)
        .where(
          and(
            eq(agentVersions.id, request.params.version_id),
            eq(agentVersions.agentId, request.params.agent_id),
            eq(agentVersions.orgId, orgId),
          ),
        )
        .limit(1);

      if (!result[0]) throw notFound('Agent version not found');
      return formatVersion(result[0]);
    },
  );
}
