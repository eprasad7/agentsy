import { apiKeys, organizations } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { notFound } from '../plugins/error-handler.js';
import { generateApiKey } from '../services/api-keys.js';

const createKeySchema = z.object({
  name: z.string().min(1).max(255),
  expires_at: z.string().datetime().optional(),
});

export function apiKeyRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/api-keys — create, returns full key ONCE
  app.post('/v1/api-keys', async (request, reply) => {
    const orgId = request.orgId!;
    const body = createKeySchema.parse(request.body);

    // Get org slug for key prefix
    const orgResult = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .limit(1);

    const slug = orgResult[0]?.slug ?? 'unknown';
    const { fullKey, prefix, keyHash } = generateApiKey(slug);
    const id = newId('key');

    await db.insert(apiKeys).values({
      id,
      orgId,
      name: body.name,
      prefix,
      keyHash,
      expiresAt: body.expires_at ? new Date(body.expires_at) : undefined,
      createdBy: request.userId,
    });

    reply.status(201);
    return {
      id,
      name: body.name,
      prefix,
      key: fullKey, // Only returned once!
      created_at: new Date().toISOString(),
    };
  });

  // GET /v1/api-keys — list (prefix only, never full key)
  app.get('/v1/api-keys', async (request) => {
    const orgId = request.orgId!;

    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.orgId, orgId));

    return {
      data: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        last_used_at: k.lastUsedAt?.toISOString() ?? null,
        expires_at: k.expiresAt?.toISOString() ?? null,
        revoked_at: k.revokedAt?.toISOString() ?? null,
        created_at: k.createdAt.toISOString(),
      })),
    };
  });

  // GET /v1/api-keys/:id
  app.get<{ Params: { id: string } }>('/v1/api-keys/:id', async (request) => {
    const orgId = request.orgId!;

    const result = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, request.params.id), eq(apiKeys.orgId, orgId)))
      .limit(1);

    if (!result[0]) throw notFound('API key not found');

    const k = result[0];
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      expires_at: k.expiresAt?.toISOString() ?? null,
      revoked_at: k.revokedAt?.toISOString() ?? null,
      created_at: k.createdAt.toISOString(),
    };
  });

  // POST /v1/api-keys/:id/revoke
  app.post<{ Params: { id: string } }>('/v1/api-keys/:id/revoke', async (request) => {
    const orgId = request.orgId!;

    const result = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, request.params.id), eq(apiKeys.orgId, orgId)))
      .returning({ id: apiKeys.id });

    if (!result.length) throw notFound('API key not found');
    return { revoked: true };
  });
}
