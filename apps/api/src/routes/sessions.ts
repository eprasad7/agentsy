import {
  agents,
  sessions,
  messages,
  type SessionMetadata,
} from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq, and, isNull, desc, gt, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { notFound } from '../plugins/error-handler.js';

// ── Schemas ─────────────────────────────────────────────────────────

const createSessionSchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

const messagesPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
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

function formatSession(s: typeof sessions.$inferSelect) {
  return {
    id: s.id,
    org_id: s.orgId,
    agent_id: s.agentId,
    metadata: s.metadata,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  };
}

function formatMessage(m: typeof messages.$inferSelect) {
  return {
    id: m.id,
    session_id: m.sessionId,
    run_id: m.runId,
    role: m.role,
    content: m.content,
    tool_call_id: m.toolCallId,
    tool_name: m.toolName,
    message_order: m.messageOrder,
    metadata: m.metadata,
    created_at: m.createdAt.toISOString(),
  };
}

// ── Routes ──────────────────────────────────────────────────────────

export function sessionRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/agents/:agent_id/sessions — create session
  app.post<{ Params: { agent_id: string } }>('/v1/agents/:agent_id/sessions', async (request, reply) => {
    const orgId = request.orgId!;
    const body = createSessionSchema.parse(request.body ?? {});

    // Verify agent exists
    const agentResult = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, request.params.agent_id), eq(agents.orgId, orgId), isNull(agents.deletedAt)))
      .limit(1);

    if (!agentResult[0]) throw notFound('Agent not found');

    const id = newId('ses');
    const now = new Date();

    await db.insert(sessions).values({
      id,
      orgId,
      agentId: request.params.agent_id,
      metadata: (body.metadata ?? {}) as SessionMetadata,
      createdAt: now,
      updatedAt: now,
    });

    reply.status(201);
    return {
      id,
      org_id: orgId,
      agent_id: request.params.agent_id,
      metadata: body.metadata ?? {},
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
  });

  // GET /v1/agents/:agent_id/sessions — list sessions
  app.get<{ Params: { agent_id: string } }>('/v1/agents/:agent_id/sessions', async (request) => {
    const orgId = request.orgId!;
    const query = listPaginationSchema.parse(request.query);

    const conditions = [
      eq(sessions.orgId, orgId),
      eq(sessions.agentId, request.params.agent_id),
      isNull(sessions.deletedAt),
    ];

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (decoded) {
        conditions.push(query.order === 'desc' ? lt(sessions.id, decoded.id) : gt(sessions.id, decoded.id));
      }
    }

    const rows = await db
      .select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(query.order === 'desc' ? desc(sessions.createdAt) : sessions.createdAt)
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);

    return {
      data: data.map(formatSession),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // GET /v1/sessions/:session_id/messages — list session messages
  app.get<{ Params: { session_id: string } }>('/v1/sessions/:session_id/messages', async (request) => {
    const orgId = request.orgId!;
    const query = messagesPaginationSchema.parse(request.query);

    // Verify session exists and belongs to org
    const sessionResult = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, request.params.session_id), eq(sessions.orgId, orgId), isNull(sessions.deletedAt)))
      .limit(1);

    if (!sessionResult[0]) throw notFound('Session not found');

    const conditions = [eq(messages.sessionId, request.params.session_id)];

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (decoded) {
        conditions.push(query.order === 'desc' ? lt(messages.id, decoded.id) : gt(messages.id, decoded.id));
      }
    }

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(query.order === 'desc' ? desc(messages.messageOrder) : messages.messageOrder)
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);

    return {
      data: data.map(formatMessage),
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null,
    };
  });

  // DELETE /v1/sessions/:session_id — soft delete
  app.delete<{ Params: { session_id: string } }>('/v1/sessions/:session_id', async (request, reply) => {
    const orgId = request.orgId!;

    const result = await db
      .update(sessions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sessions.id, request.params.session_id), eq(sessions.orgId, orgId), isNull(sessions.deletedAt)))
      .returning({ id: sessions.id });

    if (!result[0]) throw notFound('Session not found');
    reply.status(204);
    return;
  });
}
