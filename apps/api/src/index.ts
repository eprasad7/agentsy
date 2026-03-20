import Fastify from 'fastify';

import { createDb } from './lib/db.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerIdempotencyMiddleware } from './middleware/idempotency.js';
import { registerRateLimitMiddleware } from './middleware/rate-limit.js';
import { registerRlsMiddleware } from './middleware/rls.js';
import { registerCors } from './plugins/cors.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestLogger } from './plugins/request-logger.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { environmentRoutes } from './routes/environments.js';
import { healthRoutes } from './routes/health.js';
import { organizationRoutes, memberRoutes } from './routes/organizations.js';
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

  // 1. Plugins
  await registerCors(app);
  registerErrorHandler(app);
  registerRequestLogger(app);

  // 2. Middleware (order matters)
  if (db) {
    registerAuthMiddleware(app, db);
    registerRlsMiddleware(app, db);
  }
  registerRateLimitMiddleware(app);
  registerIdempotencyMiddleware(app);

  // 3. Routes
  await healthRoutes(app);

  if (db) {
    organizationRoutes(app, db);
    memberRoutes(app, db);
    apiKeyRoutes(app, db);
    secretRoutes(app, db);
    environmentRoutes(app, db);
  }

  // 4. Start
  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
