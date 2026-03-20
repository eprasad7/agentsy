import Fastify from 'fastify';

import { createAuth } from './lib/auth.js';
import { createDb } from './lib/db.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerIdempotencyMiddleware } from './middleware/idempotency.js';
import { registerRateLimitMiddleware } from './middleware/rate-limit.js';
import { registerRlsMiddleware } from './middleware/rls.js';
import { checkConcurrentRunLimit } from './middleware/concurrent-run-limiter.js';
import { registerCors } from './plugins/cors.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestLogger } from './plugins/request-logger.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { environmentRoutes } from './routes/environments.js';
import { healthRoutes } from './routes/health.js';
import { organizationRoutes, memberRoutes } from './routes/organizations.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { secretRoutes } from './routes/secrets.js';

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
});

async function start() {
  // Initialize DB (skip in dev without DATABASE_URL)
  const databaseUrl = process.env['DATABASE_URL'];
  const db = databaseUrl ? createDb(databaseUrl) : undefined;

  // Initialize Better Auth (requires DB)
  const auth = databaseUrl ? createAuth(databaseUrl) : undefined;

  // 1. Plugins
  await registerCors(app);
  registerErrorHandler(app);
  registerRequestLogger(app);

  // 2. Middleware (order matters: CORS → Logger → Auth → RLS → Rate Limit → Idempotency)
  if (db) {
    registerAuthMiddleware(app, db, auth);
    registerRlsMiddleware(app, db);
  }
  registerRateLimitMiddleware(app);
  registerIdempotencyMiddleware(app);

  // 3. Routes
  await healthRoutes(app, db);

  // Mount Better Auth routes (/api/auth/*)
  if (auth) {
    app.all('/api/auth/*', async (request, reply) => {
      // Convert Node IncomingMessage to Web Request for Better Auth
      const url = `${request.protocol}://${request.hostname}${request.url}`;
      const webRequest = new Request(url, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        body: request.method !== 'GET' && request.method !== 'HEAD'
          ? JSON.stringify(request.body)
          : undefined,
      });
      const response = await auth.handler(webRequest);
      reply.status(response.status);
      response.headers.forEach((value: string, key: string) => {
        reply.header(key, value);
      });
      const body = await response.text();
      reply.send(body);
    });
  }

  if (db) {
    onboardingRoutes(app, db);
    organizationRoutes(app, db);
    memberRoutes(app, db);
    apiKeyRoutes(app, db);
    secretRoutes(app, db);
    environmentRoutes(app, db);

    // Concurrent run limiter — only for run creation
    app.addHook('preHandler', async (request) => {
      if (
        request.method === 'POST' &&
        /^\/v1\/agents\/[^/]+\/run$/.test(request.url) &&
        request.orgId &&
        request.orgPlan
      ) {
        await checkConcurrentRunLimit(request.orgId, request.orgPlan);
      }
    });
  }

  // 4. Start
  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
