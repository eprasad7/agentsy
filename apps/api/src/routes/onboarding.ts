import { environments, organizationMembers, organizations } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { unauthorized } from '../plugins/error-handler.js';

const onboardingSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

const DEFAULT_ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export function onboardingRoutes(app: FastifyInstance, db: DbClient): void {
  // POST /v1/onboarding — create org + membership + default environments
  app.post('/v1/onboarding', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      throw unauthorized();
    }

    const body = onboardingSchema.parse(request.body);

    const orgId = newId('org');

    // Create organization
    const orgResult = await db
      .insert(organizations)
      .values({
        id: orgId,
        name: body.name,
        slug: body.slug,
        externalAuthId: userId,
      })
      .returning();

    const org = orgResult[0]!;

    // Create admin membership for the current user
    await db.insert(organizationMembers).values({
      id: newId('mem'),
      orgId,
      userId,
      role: 'admin',
    });

    // Create default environments
    await db.insert(environments).values(
      DEFAULT_ENVIRONMENTS.map((name) => ({
        id: newId('env'),
        orgId,
        name,
        requireApprovalForWriteTools: name === 'production',
      })),
    );

    reply.status(201);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      billing_email: org.billingEmail,
      created_at: org.createdAt.toISOString(),
      updated_at: org.updatedAt.toISOString(),
    };
  });
}
