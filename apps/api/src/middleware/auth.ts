import { apiKeys, organizationMembers, organizations } from '@agentsy/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Auth } from '../lib/auth.js';
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
    /** Request-scoped DB client with RLS context set. Use this for all queries. */
    scopedDb?: import('../lib/db.js').DbClient;
  }
}

const PUBLIC_ROUTES = ['/health', '/api/auth'];

function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some((r) => url.startsWith(r));
}

export function registerAuthMiddleware(
  app: FastifyInstance,
  db: DbClient,
  auth?: Auth,
): void {
  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (isPublicRoute(request.url)) return;

    const authHeader = request.headers.authorization;

    // Try API key auth first
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (token.startsWith('sk-agentsy-')) {
        await authenticateApiKey(request, db, token);
        return;
      }
    }

    // Try Better Auth session (cookie-based)
    if (auth && request.headers.cookie) {
      try {
        const headers = new Headers();
        for (const [key, val] of Object.entries(request.headers)) {
          if (val) headers.set(key, Array.isArray(val) ? val.join(', ') : val);
        }
        const session = await auth.api.getSession({ headers });
        if (session?.session && session?.user) {
          request.userId = session.user.id;
          request.authMethod = 'session';

          // Resolve org membership for the session user
          // Skip for onboarding (user has no org yet)
          if (!request.url.startsWith('/v1/onboarding')) {
            const membership = await db
              .select({
                orgId: organizationMembers.orgId,
                role: organizationMembers.role,
              })
              .from(organizationMembers)
              .where(eq(organizationMembers.userId, session.user.id))
              .limit(1);

            if (!membership[0]) {
              throw forbidden('No organization membership found');
            }

            request.orgId = membership[0].orgId;
            request.userRole = membership[0].role as 'admin' | 'member';

            // Fetch org plan
            const orgResult = await db
              .select({ plan: organizations.plan })
              .from(organizations)
              .where(
                and(eq(organizations.id, membership[0].orgId), isNull(organizations.deletedAt)),
              )
              .limit(1);

            if (orgResult[0]) {
              request.orgPlan = orgResult[0].plan;
            }
          }

          return;
        }
      } catch (err) {
        // Re-throw intentional API errors (e.g. 403 no membership)
        if (err instanceof Error && err.name === 'ApiError') throw err;
        // Session auth failed, fall through
      }
    }

    if (!authHeader) {
      throw unauthorized();
    }
    throw unauthorized('Invalid authentication method');
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
