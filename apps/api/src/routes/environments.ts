import { environments } from '@agentsy/db';
import { eq, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { notFound, validationError } from '../plugins/error-handler.js';

const updateEnvSchema = z.object({
  tool_allow_list: z.array(z.string()).nullable().optional(),
  tool_deny_list: z.array(z.string()).nullable().optional(),
  require_approval_for_write_tools: z.boolean().optional(),
});

export function environmentRoutes(app: FastifyInstance, db: DbClient): void {
  // GET /v1/environments
  app.get('/v1/environments', async (request) => {
    const orgId = request.orgId!;

    const envs = await db
      .select()
      .from(environments)
      .where(eq(environments.orgId, orgId));

    return {
      data: envs.map((e) => ({
        id: e.id,
        name: e.name,
        tool_allow_list: e.toolAllowList,
        tool_deny_list: e.toolDenyList,
        require_approval_for_write_tools: e.requireApprovalForWriteTools,
        created_at: e.createdAt.toISOString(),
        updated_at: e.updatedAt.toISOString(),
      })),
    };
  });

  // PATCH /v1/environments/:id
  app.patch<{ Params: { id: string } }>('/v1/environments/:id', async (request) => {
    const orgId = request.orgId!;
    const body = updateEnvSchema.parse(request.body);

    const updates: Record<string, unknown> = {};
    if (body.tool_allow_list !== undefined) updates['toolAllowList'] = body.tool_allow_list;
    if (body.tool_deny_list !== undefined) updates['toolDenyList'] = body.tool_deny_list;
    if (body.require_approval_for_write_tools !== undefined)
      updates['requireApprovalForWriteTools'] = body.require_approval_for_write_tools;

    if (Object.keys(updates).length === 0) {
      throw validationError('No fields to update');
    }

    const result = await db
      .update(environments)
      .set(updates)
      .where(and(eq(environments.id, request.params.id), eq(environments.orgId, orgId)))
      .returning();

    if (!result.length) throw notFound('Environment not found');

    const e = result[0]!;
    return {
      id: e.id,
      name: e.name,
      tool_allow_list: e.toolAllowList,
      tool_deny_list: e.toolDenyList,
      require_approval_for_write_tools: e.requireApprovalForWriteTools,
      created_at: e.createdAt.toISOString(),
      updated_at: e.updatedAt.toISOString(),
    };
  });
}
