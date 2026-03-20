import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { getDb } from '../lib/request-db.js';
import { createSecret, listSecrets, updateSecret, deleteSecret } from '../services/secrets.js';

const createSecretSchema = z.object({
  name: z.string().min(1).max(255),
  key: z.string().min(1).max(255),
  value: z.string().min(1),
  environment: z.enum(['development', 'staging', 'production']),
  description: z.string().optional(),
});

export function secretRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/secrets
  app.post('/v1/secrets', async (request, reply) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const body = createSecretSchema.parse(request.body);

    const result = await createSecret(d, {
      orgId,
      name: body.name,
      key: body.key,
      value: body.value,
      environment: body.environment,
      description: body.description,
      createdBy: request.userId,
    });

    reply.status(201);
    return result;
  });

  // GET /v1/secrets — list names only, never values
  app.get('/v1/secrets', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    const secrets = await listSecrets(d, orgId);

    return {
      data: secrets.map((s) => ({
        id: s.id,
        name: s.name,
        key: s.key,
        environment: s.environment,
        description: s.description,
        last_rotated_at: s.lastRotatedAt?.toISOString() ?? null,
        created_at: s.createdAt.toISOString(),
      })),
    };
  });

  // PUT /v1/secrets/:id — update/rotate secret value
  app.put<{ Params: { id: string } }>('/v1/secrets/:id', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);

    const updateSchema = z.object({
      value: z.string().min(1),
      description: z.string().optional(),
    });
    const body = updateSchema.parse(request.body);

    const result = await updateSecret(d, orgId, request.params.id, body.value, body.description);
    return result;
  });

  // DELETE /v1/secrets/:id
  app.delete<{ Params: { id: string } }>('/v1/secrets/:id', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);
    await deleteSecret(d, orgId, request.params.id);
    return { deleted: true };
  });
}
