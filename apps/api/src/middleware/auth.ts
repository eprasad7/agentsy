import { apiKeys, organizations } from '@agentsy/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';


import type { DbClient } from '../lib/db.js';
import { forbidden, unauthorized } from '../plugins/error-handler.js';
import { hashApiKey } from '../services/api-keys.js';

// Augment Fastify request with auth context
declare module 'fastify' {
  interface FastifyRequest {
    orgId?: string;
    userId?: string;
    userRole?: 'admin' | 'member';
    orgPlan?: string;
    authMethod?: 'api_key' | 'session';
  }
}

const PUBLIC_ROUTES = ['/health', '/api/auth'];

function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some((r) => url.startsWith(r));
}

export function registerAuthMiddleware(app: FastifyInstance, db: DbClient): void {
  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (isPublicRoute(request.url)) return;

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw unauthorized();
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (token.startsWith('sk-agentsy-')) {
      await authenticateApiKey(request, db, token);
    } else {
      // Session auth will be handled by Better Auth in step 1.2
      // For now, reject non-API-key tokens
      throw unauthorized('Invalid authentication method');
    }
  });
}

async function authenticateApiKey(
  request: FastifyRequest,
  db: DbClient,
  key: string,
): Promise<void> {
  const keyHash = hashApiKey(key);

  const result = await db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  const keyRecord = result[0];
  if (!keyRecord) {
    throw unauthorized('Invalid API key');
  }

  if (keyRecord.revokedAt) {
    throw forbidden('API key has been revoked');
  }

  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    throw forbidden('API key has expired');
  }

  // Get org plan
  const orgResult = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(and(eq(organizations.id, keyRecord.orgId), isNull(organizations.deletedAt)))
    .limit(1);

  if (!orgResult[0]) {
    throw forbidden('Organization not found or deleted');
  }

  // Update last_used_at (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id))
    .catch(() => {});

  request.orgId = keyRecord.orgId;
  request.orgPlan = orgResult[0].plan;
  request.authMethod = 'api_key';
}
