import { organizations, organizationMembers } from '@agentsy/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  billing_email: z.string().email().optional(),
});

export function organizationRoutes(app: FastifyInstance, db: DbClient): void {
  // GET /v1/organization — current org
  app.get('/v1/organization', async (request) => {
    const orgId = request.orgId!;

    const result = await db
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .limit(1);

    if (!result[0]) throw notFound('Organization not found');

    const org = result[0];
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

  // PATCH /v1/organization — update org (admin only)
  app.patch('/v1/organization', async (request) => {
    const orgId = request.orgId!;

    // Check admin role
    if (request.userRole && request.userRole !== 'admin') {
      throw forbidden('Only admins can update organization settings');
    }

    const body = updateOrgSchema.parse(request.body);

    const updates: Record<string, unknown> = {};
    if (body.name) updates['name'] = body.name;
    if (body.billing_email) updates['billingEmail'] = body.billing_email;

    if (Object.keys(updates).length === 0) {
      throw validationError('No fields to update');
    }

    const result = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId))
      .returning();

    const org = result[0]!;
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

export function memberRoutes(app: FastifyInstance, db: DbClient): void {
  // GET /v1/organization/members
  app.get('/v1/organization/members', async (request) => {
    const orgId = request.orgId!;

    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgId));

    return {
      data: members.map((m) => ({
        id: m.id,
        user_id: m.userId,
        role: m.role,
        created_at: m.createdAt.toISOString(),
      })),
    };
  });

  // DELETE /v1/organization/members/:id
  app.delete<{ Params: { id: string } }>(
    '/v1/organization/members/:id',
    async (request) => {
      const orgId = request.orgId!;
      const memberId = request.params.id;

      if (request.userRole && request.userRole !== 'admin') {
        throw forbidden('Only admins can remove members');
      }

      const result = await db
        .delete(organizationMembers)
        .where(
          and(eq(organizationMembers.id, memberId), eq(organizationMembers.orgId, orgId)),
        )
        .returning({ id: organizationMembers.id });

      if (!result.length) throw notFound('Member not found');
      return { deleted: true };
    },
  );
}
